//Make BSON::Timestamp comparable
//require 'date'
//require 'bson'

module.exports = {
    toS: function (position) {
        return `${position.seconds}:${position.increment}`;
    },

    fromJson(position){
        return {
            seconds: position.$timestamp.t,
            increment: position.$timestamp.i
        }
    },
    new(seconds, increment){
        return {
            seconds: seconds,
            increment: increment
        }
    }
};

/* hash: function()
 toS.hash
 end

 def eql? other
 self == other
 end

 module ClassMethods
 # Accepts {'t' => seconds, 'i' => increment} or {'$timestamp' => {'t' => seconds, 'i' => increment}}
 def fromJson(data)
 data = data['$timestamp'] if data['$timestamp']
 self.new(data['t'], data['i'])
 end

 # Accepts: <seconds>[:ordinal]
 def from_string(string)
 match = /(\d+)(?::(\d+))?/.match(string)
 return nil unless match
 s1 = match[1].to_i
 i1 = match[2].to_i
 self.new(s1,i1)
 end
 end

 end
 end

 ::BSON::Timestamp.__send__(:include, Comparable)
 ::BSON::Timestamp.__send__(:include, MongoOplogBackup::Ext::Timestamp)
 ::BSON::Timestamp.extend(MongoOplogBackup::Ext::Timestamp::ClassMethods)
 */