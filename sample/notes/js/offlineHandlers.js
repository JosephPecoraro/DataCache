/*
 * Offline Handlers for this Application
 * Joseph Pecoraro
 */


/*
 * NOTE: My REST API's interface is rather ugly right now.
 * (it all uses one uri, for updates, etc.) This makes some
 * of this code needlessly complex. I plan to fix that.
 *
 * It currently is:
 *
 *   UDPATE api/     => Peeks into the {data} to find what to update.
 *
 * It should be:
 *
 *   UPDATE api/1    => Updates TwitterBox with id 1.
 *
 *
 * NOTE: The DataCache Library currently does not store its
 * contents persistently. This means cached information is
 * lost on reload. I have a simple localStorage trick here
 * to enable this application to work. Most of the FIXME's
 * explain what will be removed.
 *
 *
 * NOTE: Synchronization and automatic Online Detection are
 * note yet implemented.
 */

// Fake Offline for Testing Purposes
// DataCache.Offline = true;

// Prevent Namespace Collisions
(function() {

    // ----------------------------------
    //   Temporary Table of Saved Items
    // ----------------------------------
    // NOTE: This just stores in localStorage all the
    // items that we have captured, since there is no way
    // to just "pull" them individually.
    //
    // FIXME: This currently stores the request in localStorage
    // that is a task that DataCache should do. This is to handle
    // that persitently across page loads.

    function SavedItems() {
        var savedValue = window.localStorage[SavedItems.STORAGEKEY];
        this.items = (savedValue ? JSON.parse(savedValue) : {});
    }

    SavedItems.STORAGEKEY = 'saveditems';

    SavedItems.prototype = {
        add: function(id, body) {
            this.items[id] = true;
            window.localStorage.setItem(id, JSON.stringify(body)); // FIXME: to remove
            this._store();
        },

        remove: function(id) {
            delete this.items[id];
            window.localStorage.removeItem(id) // FIXME: to remove
            this._store();
        },

        _store: function() {
            window.localStorage[SavedItems.STORAGEKEY] = JSON.stringify(this.items);
        }
    }


    // -----------
    //   States
    // -----------

    var apiURI = 'api/';
    var dynamicMethods = ['GET', 'POST', 'PUT', 'DELETE'];


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    var savedItems = new SavedItems();
    var cache = window.openDataCache();
    cache.offlineTransaction(function(tx) {
        tx.capture(apiURI, null, null, dynamicMethods);
        tx.commit();
    });


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    navigator.registerOfflineHandler(apiURI, interceptor, reviewer);

    function reviewer(request, response) {
        // Do nothing yet.
    }

    function interceptor(request, response) {
        var handler = interceptor[request.method.toUpperCase()];
        if (handler)
            handler(request, response);

        response.setStatus(400, Http.Status[400]);
        response.send();
    }


    // ------------------------
    //   CRUD / REST Handlers
    // ------------------------

    interceptor.POST = function(request, response) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        cache.offlineTransaction(function(tx) {
            var key = apiURI+obj.id;
            savedItems.add(key, request.bodyText); // FIXME: this should not pass the bodyText
            tx.capture(key, request.bodyText, request.headers['Content-Type'], dynamicMethods);
            tx.commit();
        });

        response.setStatus(201, Http.Status[201]);
        response.send();
    }

    interceptor.GET = function(request, response) {
        var tx = cache.transactionSync();
        var arr = [];
        for (var key in savedItems.items) {
            var body = JSON.parse(window.localStorage[key]);
            var obj = parseBoxObjectFromRequest(body);
            arr.push(obj)
        }

        // FIXME: This should become:
        // for (var key in savedItems.items) {
        //     var body = tx.getItem(key);
        //     var obj = parseBoxObjectFromRequest(body);
        //     arr.push(obj)
        // }

        response.setStatus(200, Http.Status[200]);
        response.setResponseText(JSON.stringify(arr));
        response.send();
    }

    interceptor.PUT = function(request, response) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        cache.offlineTransaction(function(tx) {
            var key = apiURI+obj.id;
            savedItems.add(key, request.bodyText); // FIXME: this should be removed
            tx.capture(key, request.bodyText, request.headers['Content-Type'], dynamicMethods);
            tx.commit();
        });

        response.setStatus(200, Http.Status[200]);
        response.send();
    }

    interceptor.DELETE = function(request, response) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        cache.offlineTransaction(function(tx) {
            var key = apiURI+obj.id;
            savedItems.remove(key);
            tx.release(key);
            tx.commit();
        });

        response.setStatus(200, Http.Status[200]);
        response.send();
    }


    // --------------------
    //   Helper Functions
    // --------------------
    // NOTE: This is doing the work that PHP does in the background.
    // This parses the query data into a hash table and decodes them.

    function parseQueryData(data) {
        data = data.replace(/\+/g, ' ');
        var hash = {};
        var chunks = data.split(/&/);
        for (var i=0, len=chunks.length; i<len; ++i) {
            var p = chunks[i].split(/=/);
            hash[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
        }

        return hash;
    }

    function parseBoxObjectFromRequest(data) {
        var hash = parseQueryData(data);
        return JSON.parse(hash.data);
    }

})();
