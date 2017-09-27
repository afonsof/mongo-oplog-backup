const timestamp = require('./timestamp');
var fs = require("fs");
var path = require("path");
var utils = require("./utils.js");
var BSON = require('bson');
var Config = require('./config');

module.exports = {
    each_document: function (filename) {
        return new Promise(resolve=> {
            if (this.gzip_fingerprint(filename)) {
                //todo: Zlib::GzipReader.open(filename, yield_bson_document)
            }
            else {
                Config.bsondump(['--quiet', `${filename}`])
                    .then(items=> {
                        let len = items.length;
                        items = items.slice(0, len - 1);
                        var json = '[' + items.split('\n').join(',') + ']';
                        resolve(JSON.parse(json));
                    });
            }
        });
    },

    oplogTimestamps: function (filename) {
        return this.each_document(filename)
            .then(function (items) {
                return items.filter(i=>i['ts']);
            });
    },

    FILENAME_RE: /\/oplog-(\d+):(\d+)-(\d+):(\d+)\.bson(?:\.gz)?\z/,

    timestamps_from_filename: function (filename) {
        let match = this.FILENAME_RE.match(filename);
        if (!match) return null;
        let s1 = match[1];
        let i1 = match[2];
        let s2 = match[3];
        let i2 = match[4];

        let first = timestamp.new(s1, i1);
        let last = timestamp.new(s2, i2);
        return {
            first: first,
            last: last
        };
    },

    merge: function (target, source_files, options = {}) {
        let limit = options['limit'];
        let force = options['force'];
        let compress = !!options['gzip'];

        let process_output = function (output) {
            let last_timestamp = null;
            let first = true;

            source_files.forEach(function (filename) {
                let timestamps = this.timestamps_from_filename(filename);
                let expected_first, expected_last;
                if (timestamps) {
                    expected_first = timestamps['first'];
                    expected_last = timestamps['last'];
                }
                else {
                    expected_first = null;
                    expected_last = null;
                }

                // Optimize:
                // We can assume that the timestamps are in order.
                // This means we only need to find the first non-overlapping point,
                // and the rest we can pass through directly.
                console.log(`Reading ${filename}`);
                let last_file_timestamp = null;
                let skipped = 0;
                let wrote = 0;
                let first_file_timestamp = null;
                this.each_document(filename).then(function (doc) {
                    let timestamp = doc['ts'];

                    if (first_file_timestamp == null) {
                        first_file_timestamp = timestamp;
                    }

                    // gzip stores the mtime in the header, so we set it explicity for consistency between runs.
                    if (parseInt(output.mtime) === 0) {
                        output.mtime = first_file_timestamp.seconds;
                    }

                    if (last_timestamp != null && timestamp <= last_timestamp) {
                        skipped += 1;
                    }
                    else if (last_file_timestamp != null && timestamp <= last_file_timestamp) {
                        throw Error(`Timestamps out of order in ${filename}`);
                    }
                    else {
                        output.write(doc.to_bson);
                        wrote += 1;
                        last_timestamp = timestamp
                    }
                    last_file_timestamp = timestamp
                });

                if (expected_first && first_file_timestamp != expected_first) {
                    throw new Exception(`${expected_first} was not the first timestamp in ${filename}`);
                }

                if (expected_last && last_file_timestamp != expected_last) {
                    throw new Exception(`${expected_last} was not the last timestamp in ${filename}`);
                }

                console.info(`Wrote ${wrote} and skipped ${skipped} oplog entries from ${filename}`);
                if (!first && !skipped === 1 && force) {
                    throw new Error("Overlap must be exactly 1");
                }
                first = false;
            });

            if (compress) {
                //Zlib::GzipWriter.open(target, &process_output)
            } else {
                //File.open(target, 'wb', &process_output)
            }
        }
    },

    find_oplogs: function (dir) {
        let files = fs.readdirSync(path.join(dir, 'oplog-*.bson*'));
        files = files.filter(file => {
            return this.FILENAME_RE.match(file);
        });

        files.sort((a, b)=> {
            return this.timestamps_from_filename(a)['first'] > this.timestamps_from_filename(b)['first'];
        });
    },

    mergeBackup: function (dir) {
        let oplogs = this.find_oplogs(dir);
        let isGzip = oplogs.filter(o=>o.endsWith('.gz'));
        let target = path.join(dir, 'dump', 'oplog.bson');
        // Mongorestore expects this filename, without a gzip suffix.
        fs.mkdirSync(path.join(dir, 'dump'));
        this.merge(target, oplogs, {gzip: isGzip})
    },

    gzip_fingerprint: function (filename) {
        let bytes = fs.readFileSync(filename);
        return bytes[0] == "\x1f" && bytes[1] == "\x8b"
    }
};