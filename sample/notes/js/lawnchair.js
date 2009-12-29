/**
 * Lawnchair
 * =========
 * A lightweight JSON document store.
 *
 */
var Lawnchair = function(opts) {
    this.init(opts);
}

Lawnchair.prototype = {

    init:function(opts) {
        var adaptors = {
            'webkit':window.WebkitSQLiteAdaptor,
            'gears':window.GearsSQLiteAdaptor,
            'dom':window.DOMStorageAdaptor,
            'cookie':window.CookieAdaptor,
            'air':window.AIRSQLiteAdaptor
        };

        this.adaptor = opts.adaptor ? new adaptors[opts.adaptor](opts) : new WebkitSQLiteAdaptor(opts);
    },

    // Save an object to the store. If a key is present then update. Otherwise create a new record.
    save:function(obj, callback) {this.adaptor.save(obj, callback)},

    // Invokes a callback on an object with the matching key.
    get:function(key, callback) {this.adaptor.get(key, callback)},

    // Just pulls the object with the matching key
    getSync:function(key) {return this.adaptor.getSync(key)},

    // Returns all rows to a callback.
    all:function(callback) {this.adaptor.all(callback)},

    // Removes a json object from the store.
    remove:function(keyOrObj) {this.adaptor.remove(keyOrObj)},

    // Removes all documents from a store and returns self.
    nuke:function() {this.adaptor.nuke();return this},

    /**
     * Iterator that accepts two paramters (methods or eval strings):
     *
     * - conditional test for a record
     * - callback to invoke on matches
     *
     */
    find:function(condition, callback) {
        var is = (typeof condition == 'string') ? function(r){return eval(condition)} : condition;
        var cb = this.adaptor.terseToVerboseCallback(callback);

        this.each(function(record, index) {
            if (is(record)) cb(record, index); // thats hot
        });
    },


    /**
     * Classic iterator.
     * - Passes the record and the index as the second parameter to the callback.
     * - Accepts a string for eval or a method to be invoked for each document in the collection.
     */
    each:function(callback) {
        var cb = this.adaptor.terseToVerboseCallback(callback);
        this.all(function(results) {
            var l = results.length;
            for (var i = 0; i < l; i++) {
                cb(results[i], i);
            }
        });
    }
// --
};