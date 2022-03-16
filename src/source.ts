// Source manager

"use strict";

import MySQL from "mysql2";
import { AsyncSemaphore } from "@asanrom/async-tools";
import { Readable } from "stream";
import { Config } from "./config";
import { Feature, InstanceType, QueryTree, replaceWildcards, sanitizeQueryTree, toSQLCondition, turnInto } from "./utils/deepint-sources";
import { Request } from "./utils/request";

const DEEPINT_UPDATE_INSTANCES_LIMIT = 100;

export class DataSource {
    public static instance: DataSource;

    public static getInstance() {
        if (DataSource.instance) {
            return DataSource.instance;
        }

        DataSource.instance = new DataSource();

        return DataSource.instance;
    }

    public fields: Feature[];
    public pool: MySQL.Pool;

    public updateSem: AsyncSemaphore;
    public updateQueue: InstanceType[][];
    public requiredUpdate: boolean;

    public closed: boolean;

    constructor() {
        this.fields = Config.getInstance().sourceFeatures.map((f, i) => {
            return {
                index: i,
                name: f,
                type: Config.getInstance().sourceFeaturesTypes[i] || "text",
            };
        });

        this.pool = MySQL.createPool({
            /* Single connection for sequential workers, multiple connections for server workers */
            connectionLimit: Config.getInstance().mysqlConnections,
            host: Config.getInstance().mysqlHost,
            port: Config.getInstance().mysqlPort,
            user: Config.getInstance().mysqlUser,
            password: Config.getInstance().mysqlPassword,
            database: Config.getInstance().mysqlDatabase,
            timezone: '+00:00',
        });

        this.updateQueue = [];
        this.updateSem = new AsyncSemaphore(0);
        this.requiredUpdate = false;

        this.closed = false;
    }

    private async sendInstancesToDeepIntelligence(instances: InstanceType[][]): Promise<void> {
        const url = (new URL("external/source/update", Config.getInstance().deepintURL)).toString();
        return new Promise<void>((resolve, reject) => {
            Request.post(
                url,
                {
                    headers: {
                        'x-public-key': Config.getInstance().pubKey,
                        'x-secret-key': Config.getInstance().secretKey,
                    },
                    json: instances,
                },
                (err, response, body) => {
                    if (err) {
                        return reject(err);
                    }
                    if (response.statusCode !== 200) {
                        return reject(new Error("Status code: " + response.statusCode));
                    }
                    resolve();
                },
            )
        });
    }

    public async runUpdateService() {
        while (!this.closed) {
            await this.updateSem.acquire();

            if (!this.requiredUpdate && this.updateQueue.length === 0) {
                continue;
            }

            const instancesToPush: InstanceType[][] = [];

            while (instancesToPush.length < DEEPINT_UPDATE_INSTANCES_LIMIT && this.updateQueue.length > 0) {
                instancesToPush.push(this.updateQueue.shift());
            }

            this.requiredUpdate = false;

            let done = false;

            while (!done) {
                try {
                    await this.sendInstancesToDeepIntelligence(instancesToPush);
                    done = true;
                } catch (ex) {
                    console.error(ex);
                }

                if (!done) {
                    // If failure, wait 5 seconds to retry
                    await new Promise((resolve) => {
                        setTimeout(resolve, 5000);
                    });
                }
            }

            if (Config.getInstance().logEvents) {
                console.log(`[${(new Date()).toISOString()}] [UPDATE] External source updated.`);
            }
        }
    }

    public sanitizeFilter(json: any): QueryTree {
        if (!json) {
            return null;
        }
        return sanitizeQueryTree(json, 0);
    }

    public sanitizeProjection(projection: string): number[] {
        if (!projection) {
            return [];
        }

        return projection.split(",").map(a => {
            return parseInt(a, 10);
        }).filter(a => {
            if (isNaN(a) || a < 0) {
                return false;
            }
            return !!this.fields[a];
        });
    }

    public sanitizeInstances(instances: any[]): InstanceType[][] {
        if (!Array.isArray(instances)) {
            return [];
        }
        return instances.map(i => {
            const instance: InstanceType[] = [];
            let row = i;
            if (typeof i !== "object") {
                row = Object.create(null);
            }

            for (const feature of this.fields) {
                instance.push(turnInto(row[feature.name], feature.type));
            }

            return instance;
        });
    }

    /**
     * Adds instances to the collection
     * @param instances Instances
     */
    public async pushInstances(instances: InstanceType[][]): Promise<void> {
        let sentence = "INSERT INTO " + Config.getInstance().mysqlTableLike + "(";

        sentence += this.fields.map(f => "`" + f.name + "`").join(",");

        sentence += ") VALUES ?";

        await (new Promise<void>((resolve, reject) => {
            this.pool.query(sentence, [instances], (error, results, fields) => {
                if (error) {
                    return reject(error);
                }
                resolve();
            });
        }));

        // Add to queue
        instances.forEach(i => {
            this.updateQueue.push(i)
        });
    }

    /**
     * Notices a source update
     */
    public noticeUpdate() {
        this.requiredUpdate = true;
        this.updateSem.release();
    }

    /**
     * Counts instances
     * @param filter Filter to apply
     * @returns Instances count
     */
    public async countInstances(filter: QueryTree): Promise<number> {
        let sentence = "SELECT COUNT(*) AS `count` FROM " + Config.getInstance().mysqlTableLike + "";
        const values = [];


        const cond1 = toSQLCondition(this.fields, filter);

        if (cond1.sql) {
            sentence += " WHERE " + cond1.sql;
            for (const v of cond1.params) {
                values.push(v);
            }
        }

        return new Promise<number>((resolve, reject) => {
            this.pool.query(sentence, values, (error, results: any, fields) => {
                if (error) {
                    return reject(error);
                }
                if (results && results.length > 0) {
                    resolve(results[0].count || 0);
                } else {
                    resolve(0);
                }
            });
        });
    }

    /**
     * Query instances
     * @param filter Filter to apply
     * @param order Feature to order by
     * @param dir Order direction
     * @param skip Instances to skip
     * @param limit Limit of instances to return
     * @param projection Projection to apply
     * @param onStart Called with the list of features
     * @param onRow Called for each row
     */
    public async query(filter: QueryTree, order: number, dir: string, skip: number, limit: number, projection: number[], onStart: (features: Feature[]) => void, onRow: (instance: InstanceType[]) => void): Promise<void> {
        let features = this.fields;

        let sentence = "SELECT ";
        const values = [];

        if (projection && projection.length > 0) {
            features = [];
            const proj = [];
            for (const f of projection) {
                if (this.fields[f]) {
                    proj.push('`' + this.fields[f].name + '`');

                    features.push(this.fields[f]);
                }
            }

            sentence += proj.join(", ");
        } else {
            sentence += "*";
        }

        sentence += " FROM " + Config.getInstance().mysqlTableLike + "";

        const cond1 = toSQLCondition(this.fields, filter);

        if (cond1.sql) {
            sentence += " WHERE " + cond1.sql;
            for (const v of cond1.params) {
                values.push(v);
            }
        }

        if (order >= 0 && this.fields[order]) {
            sentence += " ORDER BY `" + this.fields[order].name + "` " + (dir === "desc" ? "DESC" : "ASC");
        }

        if (limit !== null && limit > 0) {
            sentence += " LIMIT " + limit;
        }

        if (skip !== null && skip > 0) {
            sentence += " OFFSET " + skip;
        }


        if (Config.getInstance().logDebug) {
            console.log("[QUERY] [MYSQL] " + sentence + "\nValues: " + JSON.stringify(values));
        }

        return new Promise<void>((resolve, reject) => {
            const stream: Readable = this.pool.query(sentence, values).stream({ objectMode: true });

            onStart(features);

            stream.on("error", (err) => {
                reject(err);
            });

            stream.on("data", (row) => {
                const instance = [];
                for (const feature of features) {
                    instance.push(turnInto(row[feature.name], feature.type));
                }
                onRow(instance)
            });

            stream.on("end", async () => {
                resolve();
            });
        });
    }

    /**
     * Get nominal values
     * @param filter Filter to apply
     * @param query Text query for the field
     * @param feature Nominal feature
     * @returns List of nominal values
     */
    public async getNominalValues(filter: QueryTree, query: string, feature: number): Promise<string[]> {
        if (!this.fields[feature] || this.fields[feature].type !== 'nominal') {
            return [];
        }

        let sentence = "SELECT DISTINCT ";
        const values = [];

        const cond1 = toSQLCondition(this.fields, filter);
        const fieldName = this.fields[feature].name;
        query = (query || "").toLowerCase();

        sentence += '`' + fieldName + '` FROM ' + Config.getInstance().mysqlTableLike + '';

        if (cond1.sql) {
            if (query) {
                sentence += " WHERE (" + cond1.sql + ") AND `" + fieldName + "` LIKE ?";
                for (const v of cond1.params) {
                    values.push(v);
                }
                values.push("" + replaceWildcards(query) + "%");
            } else {
                sentence += " WHERE " + cond1.sql;
                for (const v of cond1.params) {
                    values.push(v);
                }
            }
        } else if (query) {
            sentence += " WHERE `" + fieldName + "` LIKE ?";
            values.push("" + replaceWildcards(query) + "%");
        }

        sentence += " ORDER BY `" + fieldName + "` ";

        sentence += " LIMIT 128";

        if (Config.getInstance().logDebug) {
            console.log("[QUERY] [MYSQL] " + sentence + "\nValues: " + JSON.stringify(values));
        }

        return new Promise<any[]>((resolve, reject) => {
            this.pool.query(sentence, values, (error, results: any, fields) => {
                if (error) {
                    return reject(error);
                }
                if (results) {
                    resolve(results.map(r => {
                        return r[fieldName];
                    }));
                } else {
                    resolve([]);
                }
            });
        });
    }
}
