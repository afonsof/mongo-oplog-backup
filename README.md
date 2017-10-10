# Mongo Oplog S3 Backup

## Installation

Install released node module:

    npm install -g mongo-oplog-s3-backup


## Usage

Your mongo server must be started with `--replSet` option. Example:
```mongod --replSet rs0```
You also need to initiate the replica set once with the command. Example using the same server as replica set:
```
mongo
> rs.initiate({
    _id: "rs0",
    version: 1,
    members: [{
            _id: 0,
            host : "localhost:27017"
        }]
})
```

To backup from localhost to the `mybackup` directory.

    mongo-oplog-s3-backup backup --dir mybackup

The first run will perform a full backup. Subsequent runs will backup any new entries from the oplog.
A full backup can be forced with the `--full` option.

It is recommended to do a full backup every few days. The restore process may
be very inefficient if the oplogs grow larger than a full backup.

For connection and authentication options, see `mongo-oplog-backup backup --help`.

The backup commands work on a live server. The initial dump with oplog replay relies
on the idempotency of the oplog to have a consistent snapshot, similar to `mongodump --oplog`.
That said, there have been bugs in the past that caused the oplog to not be idempotent
in some edge cases. Therefore it is recommended to stop the secondary before performing
a full backup.

## To restore

    mongo-oplog-backup merge --dir mybackup/backup-<timestamp>

The above command merges the individual oplog backups into `mybackup/backup-<timestamp>/dump/oplog.bson`.
This allows you to restore the backup with the `mongorestore` command:

    mongorestore --drop --oplogReplay backup/backup-<timestamp>/dump

## Backup structure

* `backup.json` - Stores the current state (oplog timestamp and backup folder).
    The only file required to perform incremental backups. It is not used for restoring a backup.
* `backup.lock` - Lock file to prevent two full backups from running concurrently.
* `backup-<timestamp>` - The current backup folder.
  * `backup.lock` - Lock file preventing two backups running concurrently in this folder.
  * `status.json` - backup status (oplog timestamp)
  * `dump` - a full mongodump
  * `oplog-<start>-<end>.bson` - The oplog from the start timestamp until the end timestamp (inclusive).

Each time a full backup is performed, a new backup folder is created.
