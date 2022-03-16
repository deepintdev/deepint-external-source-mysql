// Configuration

"use strict";

import dotenv from "dotenv";
import { FeatureType } from "./utils/deepint-sources";

dotenv.config(); // Load env variables

/**
 * Configuration class
 */
export class Config {

    public static instance: Config;

    public static getInstance() {
        if (Config.instance) {
            return Config.instance;
        }

        Config.instance = new Config();

        return Config.instance;
    }

    public httpPort: number;

    public sslEnabled: boolean;
    public sslPort: number;
    public sslCert: string;
    public sslKey: string;

    public apiDocs: boolean;

    public pubKey: string;
    public secretKey: string;

    public mysqlHost: string;
    public mysqlPort: number;
    public mysqlUser: string;
    public mysqlPassword: string;
    public mysqlDatabase: string;
    public mysqlTable: string;
    public mysqlConnections: number;

    public deepintURL: string;

    public sourceFeatures: string[];
    public sourceFeaturesTypes: FeatureType[];

    public logEvents: boolean;
    public logDebug: boolean;
    public logType: number;

    constructor() {
        // Ports
        this.httpPort = parseInt(process.env.HTTP_PORT, 10) || 80;
        this.sslPort = parseInt(process.env.SSL_PORT, 10) || 443;

        // SSL
        this.sslCert = process.env.SSL_CERT || "";
        this.sslKey = process.env.SSL_KEY || "";
        this.sslEnabled = !!(this.sslKey && this.sslCert);

        // Source
        this.pubKey = process.env.SOURCE_PUB_KEY || "";
        this.secretKey = process.env.SOURCE_SECRET_KEY || "";


        this.mysqlHost = process.env.MYSQL_HOST || "localhost";
        this.mysqlPort = parseInt(process.env.MYSQL_PORT, 10) || 3306;
        this.mysqlUser = process.env.MYSQL_USER || "root";
        this.mysqlPassword = process.env.MYSQL_PASSWORD || "";
        this.mysqlDatabase = process.env.MYSQL_DB_NAME || "test";
        this.mysqlTable = process.env.MYSQL_TABLE || "iris";
        this.mysqlConnections = parseInt(process.env.MYSQL_MAX_CONNECTIONS, 10) || 4;

        this.deepintURL = process.env.DEEPINT_API_URL || "https://app.deepint.net/api/v1/";

        this.sourceFeatures = (process.env.SOURCE_FIELDS || "").split(",").filter(a => !!a);
        this.sourceFeaturesTypes = (process.env.SOURCE_FIELDS_TYPES || "").split(",").filter(a => !!a).map(function (a: string): FeatureType {
            switch (a.toLowerCase()) {
            case "nominal":
                return "nominal";
            case "numeric":
                return "numeric";
            case "date":
                return "date";
            case "logic":
                return "logic";
            default:
                return "text";
            }
        });

        const logMode = process.env.LOG_MODE + "";

        switch (logMode.toUpperCase()) {
        case "SILENT":
            this.logEvents = false;
            this.logDebug = false;
            this.logType = 1;
            break;
        case "DEBUG":
            this.logEvents = true;
            this.logDebug = true;
            this.logType = 3;
            break;
        default:
            this.logEvents = true;
            this.logDebug = false;
            this.logType = 2;
        }

        // API docs

        this.apiDocs = ((process.env.API_DOCS + "").toUpperCase() !== "NO");
    }
}
