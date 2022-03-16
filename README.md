# Deep Intelligence External source: MySQL

This is an external source to connect a MySQL table to a Deep Intelligence data source.

## Installation

Install depedendencies

```
$ npm install
```

Requirements:

 - Node JS

To build the project type:

```
$ npm run build
```

To run the server type:

```
$ npm start
```

## Configuration

In order to configure this module, you have to set the following environment variables:

| Variable Name | Description |
|---|---|
| HTTP_PORT | HTTP listening port. Default is `80` |
| SSL_PORT | HTTPS listening port. Default is `443` |
| SSL_CERT | Path to SSL certificate. Required for HTTPS to work |
| SSL_KEY | Path to SSL private key. Required for HTTPS to work |
| LOG_MODE | Log Mode. values: DEFAULT, SILENT, DEBUG |
| API_DOCS | Set it to `YES` to generate Swagger api documentation in the `/api-docs/` path. |
| DEEPINT_API_URL | Deep Intelligence API URL, by default is `https://app.deepint.net/api/v1/` |

In order to configure the source, set the following variables:

| Variable Name | Description |
|---|---|
| SOURCE_PUB_KEY | External source public key |
| SOURCE_SECRET_KEY | External source secret key |
| MYSQL_HOST | MySQL host |
| MYSQL_PORT | MySQL port. Default: `3306` |
| MYSQL_USER | MySQL username. |
| MYSQL_PASSWORD | MySQL password. |
| MYSQL_DB_NAME | MySQL database name. |
| MYSQL_TABLE | MySQL table name. |
| MYSQL_QUERY | MySQL query to use instead of the table. Example: `SELECT * FROM iris WHERE species = 'setosa'` |
| MYSQL_MAX_CONNECTIONS | Max connections in the MySQL connection pool. |
| SOURCE_FIELDS | List of fields, split by commas. Example: `sepallength,sepalwidth,petallength,petalwidth,species` |
| SOURCE_FIELDS_TYPES | For each field, its type. Types are: `nominal`, `numeric`, `logic`, `date` and `text`. Example: `numeric,numeric,numeric,numeric,nominal` |
