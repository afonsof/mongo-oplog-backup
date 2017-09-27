module.exports = {
    ab2str: function (arr) {
        return String.fromCharCode.apply(null, arr);
    },

    timestampsIncreasing: function (timestamps) {
        let prev;
        for (let i in timestamps) {
            let ts = timestamps[i];
            if (prev && prev.seconds > ts.seconds) {
                return false;
            }
            prev = ts;
        }
        return true;
    }
};