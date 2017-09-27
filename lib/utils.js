module.exports = {
    ab2str(arr) {
        return String.fromCharCode.apply(null, arr);
    },

    timestampsIncreasing(timestamps) {
        let prev;
        for (let i in timestamps) {
            if (Object.prototype.hasOwnProperty.call(timestamps, i)) {
                let ts = timestamps[i];
                if (prev && prev.seconds > ts.seconds) {
                    return false;
                }
                prev = ts;
            }
        }
        return true;
    }
};
