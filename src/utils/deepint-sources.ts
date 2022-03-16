// Deepint sources utils

"use strict";

const QUERY_TREE_MAX_DEPH = 4;
const QUERY_TREE_MAX_CHILDREN = 16;

export interface QueryTree {
    type: string;
    operation: string;
    left: number;
    right: string;
    children: QueryTree[];
}

export function sanitizeQueryTree(tree: any, depth?: number): QueryTree {
    depth = depth || 0;
    const sanitized: QueryTree = {
        type: "anyof",
        operation: "",
        left: -1,
        right: "",
        children: [],
    };

    if (typeof tree === "object") {
        let type = ("" + tree.type).toLowerCase();

        if (!["single", "one", "anyof", "allof", "not"].includes(type)) {
            type = "anyof";
        }

        sanitized.type = type;

        let operation = ("" + tree.operation).toLowerCase();

        if (!["null", "eq", "lt", "le", "lte", "gt", "ge", "gte", "cn", "cni", "sw", "swi", "ew", "ewi"].includes(operation)) {
            operation = "";
        }

        sanitized.operation = operation;

        let left = -1;
        if (typeof tree.left === "number") {
            left = Math.floor(tree.left);
        }

        sanitized.left = left;

        if (tree.right === null) {
            sanitized.right = null;
        } else {
            let right = "" + tree.right;

            if (right.length > 1024) {
                right = right.substr(0, 1024);
            }

            sanitized.right = right;
        }

        if (depth < QUERY_TREE_MAX_DEPH && (type in { anyof: 1, allof: 1, not: 1 }) && typeof tree.children === "object" && tree.children instanceof Array) {
            for (let i = 0; i < tree.children.length && i < QUERY_TREE_MAX_CHILDREN; i++) {
                sanitized.children.push(sanitizeQueryTree(tree.children[i], depth + 1));
            }
        }
    }

    return sanitized;
}

export type FeatureType = 'nominal' | 'text' | 'numeric' | 'logic' | 'date';

export type InstanceType = string | number | Date | boolean;

export interface Feature {
    index: number;
    type: FeatureType;
    name: string;
}

export function turnInto(data: any, type: FeatureType): InstanceType {
    if (data === null || data === undefined) {
        return null;
    }
    switch (type) {
    case "nominal":
        return ("" + data).substr(0, 255);
    case "date":
        try {
            const date = new Date(data);
            date.toISOString();
            return date;
        } catch (ex) {
            return new Date(0);
        }
    case "numeric":
    {
        const n = Number(data);
        if (isNaN(n)) {
            return null;
        }
        return n;
    }
    case "logic":
    {
        if (data === "true" || data === "1") {
            return true;
        }
        if (data === "false" || data === "0") {
            return false;
        }
        return !!data;
    }
    default:
        return "" + data;
    }
}

export function replaceWildcards(text: string): string {
    return text.replace(/%/g, "\\%").replace(/\_/g, "\\_");
}

export interface SQLCondition {
    sql: string;
    params: any[];
}

export function toSQLCondition(features: Feature[], query: QueryTree): SQLCondition {
    if (!query) {
        return {
            sql: "",
            params: [],
        };

    }

    let cond: SQLCondition = {
        sql: "",
        params: [],
    };

    switch (query.type) {
    case "anyof":
        {
            let sql = "";
            let fistQuery = true;
            const params = [];
            for (const child of query.children) {
                const subQ = toSQLCondition(features, child);

                if (subQ.sql) {
                    if (fistQuery) {
                        fistQuery = false;
                        sql += "(" + subQ.sql + ")";
                    } else {
                        sql += " OR (" + subQ.sql + ")";
                    }
                    for (const p of subQ.params) {
                        params.push(p);
                    }
                }
            }
            cond = {
                sql: sql,
                params: params,
            };
        }
        break;
    case "allof":
        {
            let sql = "";
            let fistQuery = true;
            const params = [];
            for (const child of query.children) {
                const subQ = toSQLCondition(features, child);

                if (subQ.sql) {
                    if (fistQuery) {
                        fistQuery = false;
                        sql += "(" + subQ.sql + ")";
                    } else {
                        sql += " AND (" + subQ.sql + ")";
                    }
                    for (const p of subQ.params) {
                        params.push(p);
                    }
                }
            }
            cond = {
                sql: sql,
                params: params,
            };
        }
        break;
    case "not":
        {
            let sql = "";
            let fistQuery = true;
            const params = [];
            for (const child of query.children) {
                const subQ = toSQLCondition(features, child);

                if (subQ.sql) {
                    if (fistQuery) {
                        fistQuery = false;
                        sql += "(" + subQ.sql + ")";
                    } else {
                        sql += " OR (" + subQ.sql + ")";
                    }
                    for (const p of subQ.params) {
                        params.push(p);
                    }
                }
            }
            cond = {
                sql: sql ? (`NOT( ${sql} )`) : "",
                params: params,
            };
        }
        break;
    default:
    {
        if (query.operation !== "null" && query.right === null) {
            return {
                sql: "",
                params: [],
            };
        }

        const feature = features[query.left];

        if (!feature) {
            return {
                sql: "",
                params: [],
            };
        }

        const cmp = turnInto(query.right, feature.type);

        switch (query.operation) {
        case "null":
            cond.sql = '`' + feature.name + '`' + ' IS NULL';
            break;
        case "eq":
            cond.sql = '`' + feature.name + '`' + ' = ?';
            cond.params = [ cmp ];
            break;
        case "lt":
            cond.sql = '`' + feature.name + '`' + ' < ?';
            cond.params = [ cmp ];
            break;
        case "le":
        case "lte":
            cond.sql = '`' + feature.name + '`' + ' <= ?';
            cond.params = [ cmp ];
            break;
        case "gt":
            cond.sql = '`' + feature.name + '`' + ' > ?';
            cond.params = [ cmp ];
            break;
        case "ge":
        case "gte":
            cond.sql = '`' + feature.name + '`' + ' >= ?';
            cond.params = [ cmp ];
            break;
        case "cn":
            cond.sql = '`' + feature.name + '`' + ' LIKE ?';
            cond.params = [ "%" + replaceWildcards(cmp + "") + "%" ];
            break;
        case "cni":
            cond.sql = 'LOWER(`' + feature.name + '`)' + ' LIKE LOWER(?)';
            cond.params = [ "%" + replaceWildcards(cmp + "") + "%" ];
            break;
        case "sw":
            cond.sql = '`' + feature.name + '`' + ' LIKE ?';
            cond.params = [ "" + replaceWildcards(cmp + "") + "%" ];
            break;
        case "swi":
            cond.sql = 'LOWER(`' + feature.name + '`)' + ' LIKE LOWER(?)';
            cond.params = [ "" + replaceWildcards(cmp + "") + "%" ];
            break;
        case "ew":
            cond.sql = '`' + feature.name + '`' + ' LIKE ?';
            cond.params = [ "%" + replaceWildcards(cmp + "") + "" ];
            break;
        case "ewi":
            cond.sql = 'LOWER(`' + feature.name + '`)' + ' LIKE LOWER(?)';
            cond.params = [ "%" + replaceWildcards(cmp + "") + "" ];
            break;
        default:
            return {
                sql: "",
                params: [],
            };
        }
    }
    }

    return cond;
}
