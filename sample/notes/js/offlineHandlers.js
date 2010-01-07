/*
 * Offline Handlers for this Application
 * Joseph Pecoraro
 */

// ------------------------
//   Fake Offline Testing
// ------------------------

// DataCache.Offline = true;
// document.addEventListener('now-online', function() {
//     DataCache.Offline = true;
// }, false);


// Prevent Namespace Collisions
(function() {

    // -----------------
    //   UI Indicators
    // -----------------

    function indicateOnline()  { indicate('green', 'online'); }
    function indicateOffline() { indicate('red', 'offline');  }
    function indicate(color, text) {
        var elem = document.getElementById('connectivity');
        elem.style.backgroundColor = color;
        elem.innerHTML = text;
    }

    document.getElementById('connectivity').addEventListener('click', function() {
        (DataCache.Offline ? DataCache.setAsOnline() : DataCache.setAsOffline());
    }, false);

    document.addEventListener('now-online', indicateOnline, false);
    document.addEventListener('now-offline', indicateOffline, false);
    window.addEventListener('load', function() {
        setTimeout(function() {
            (DataCache.Offline ? indicateOffline() : indicateOnline());
        }, 500); // latency is for the initial automated check
    }, false);


    // ------------------------
    //   Table of Saved Items
    // ------------------------
    // NOTE: This just stores in localStorage the names of
    // items that we have captured, since there is no way
    // to just "pull" them individually.

    function SavedItems() {
        var savedValue = window.localStorage.getItem(SavedItems.STORAGEKEY);
        this.items = (savedValue ? JSON.parse(savedValue) : {});
    }

    SavedItems.STORAGEKEY = 'saveditems';

    SavedItems.prototype = {
        add: function(id) {
            this.items[id] = true;
            this._store();
        },

        remove: function(id) {
            delete this.items[id];
            this._store();
        },

        _store: function() {
            window.localStorage.setItem(SavedItems.STORAGEKEY, JSON.stringify(this.items));
        }
    }


    // ----------------
    //   RequestQueue
    // ----------------
    // NOTE: This stores in localStorage the information we need to store
    // and replay a list of actions made by the user.

    function RequestQueue() {
        this._reset();
        this._load();
    }

    RequestQueue.STORAGEKEY = 'RequestQueue';

    RequestQueue.prototype = {
        _reset: function() {
            this.uris = {};
            this.queue = [];
            this.offset = 0;
        },

        reset: function() {
            this._reset();
            this._store();
        },

        enqueue: function(uri, method) {
            method = method.toUpperCase();
            if (uri in this.uris) {
                if (method === 'DELETE') {
                    this.queue[this.uris[uri]].method = method;
                    this._store();
                }

                return;
            }

            var index = this.queue.length;
            this.queue.push({ uri: uri, method: method });
            this.uris[uri] = index;
            this._store();
        },

        process: function(itemCallback, successCallback, errorCallback) {
            for (var i=this.offset, len=this.queue.length; i<len; ++i) {
                var item = this.queue[i];
                delete this.uris[item.uri];

                if (itemCallback(item.uri, item.method) === false) {
                    if (errorCallback)
                        errorCallback();
                    this.uris[item.uri] = i;
                    this.offset = i;
                    this._store();
                    return;
                }
            }

            if (successCallback)
                successCallback();

            this.reset();
            this._store();
        },

        _store: function() {
            window.localStorage.setItem(RequestQueue.STORAGEKEY, JSON.stringify({
                uris: this.uris,
                queue: this.queue,
                offset: this.offset
            }));
        },

        _load: function() {
            var obj = window.localStorage.getItem(RequestQueue.STORAGEKEY);
            if (obj) {
                obj = JSON.parse(obj);
                this.queue = obj.queue;
                this.uris = obj.uris;
                this.offset = obj.offset;
            }
        }
    }


    // -----------
    //   States
    // -----------

    var apiURI = 'api/';
    var dynamicMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    var handlingLevel = null; // set later

    var savedItems = new SavedItems();
    var queue = new RequestQueue();


    // ----------------------------------
    //   Switch Between Handling Levels
    // ----------------------------------

    var select = document.getElementById('offline-handling');
    handlingLevel = select.options[select.selectedIndex].value;
    select.addEventListener('change', function() {
        handlingLevel = select.options[select.selectedIndex].value;
    }, false);


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    var cache = window.openDataCache();
    cache.offlineTransaction(function(tx) {
        tx.capture(apiURI, null, null, dynamicMethods);
        tx.commit();
    });


    // ----------------------------------------------------
    //   Register a Handler for requests made to this api
    // ----------------------------------------------------

    navigator.registerOfflineHandler(apiURI, interceptor, reviewer);

    function reviewer(request, response) { console.log('INSIDE REVIEWER with', request.method); // temp debug
        var handler = reviewer[request.method.toUpperCase()];
        if (handler) {
            handler(request, response);
            return;
        }
    }

    function interceptor(request, response) { console.log('INSIDE INTERCEPTOR with', request.method); // temp debug

        // Basic Handling
        if (handlingLevel === 'basic' && request.method.toUpperCase() !== 'GET') {
            alert('You are offline with basic handling. Readonly');
            response.setStatus(400, Http.Status[400]);
            response.send();
            return;
        }

        // Advnaced Handling
        var handler = interceptor[request.method.toUpperCase()];
        if (handler) {
            handler(request, response);
            return;
        }

        // Error
        response.setStatus(400, Http.Status[400]);
        response.send();

    }


    // ----------------------
    //   Generic Management
    // ----------------------

    function saveItem(request, method) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        var key = apiURI+obj.id;
        if (method)
            queue.enqueue(key, method);
        cache.offlineTransaction(function(tx) {
            savedItems.add(key);
            tx.capture(key, request.bodyText, request.headers['Content-Type'], dynamicMethods);
            tx.commit();
        });
    }

    function releaseItem(request, method) {
        var obj = parseBoxObjectFromRequest(request.bodyText);
        var key = apiURI+obj.id;
        if (method)
            queue.enqueue(key, method);
        cache.offlineTransaction(function(tx) {
            savedItems.remove(key);
            tx.release(key);
            tx.commit();
        });
    }


    // ------------------------
    //   CRUD / REST Handlers
    // ------------------------

    interceptor.GET = function(request, response) {
        var tx = cache.transactionSync();
        var arr = [];
        for (var key in savedItems.items) {
            try {
                var item = tx.cache.getItem(key); // FIXME: Private API, needed because its synchronous...
                if (item.readyState !== CacheItem.GONE) {
                    var body = item.body;
                    var obj = parseBoxObjectFromRequest(body);
                    arr.push(obj);
                }
            } catch (e) {} // ignored
        }

        response.setStatus(200, Http.Status[200]);
        response.setResponseText(JSON.stringify(arr));
        response.send();
    }

    interceptor.POST = function(request, response) {
        saveItem(request, 'POST');
        response.setStatus(201, Http.Status[201]);
        response.send();
    }

    interceptor.PUT = function(request, response) {
        saveItem(request, 'PUT');
        response.setStatus(200, Http.Status[200]);
        response.send();
    }

    interceptor.DELETE = function(request, response) {
        releaseItem(request, 'DELETE');
        response.setStatus(200, Http.Status[200]);
        response.send();
    }


    // -------------
    //   Reviewers
    // -------------

    reviewer.GET = function(request, response) {
        var o = null;
        try { o = JSON.parse(response.bodyText); } catch (e) { console.log(response); return; }
        if (!o) return;

        // Locally cache each object from the server
        // Since the offlineTransaction is async, prevent closure mistakes
        // by running it in a function where all the dynamic variables (obj)
        // are passed in and thus made static.
        for (var i=0, len=o.length; i<len; ++i) {
            (function(obj) {
                cache.offlineTransaction(function(tx) {
                    var key = apiURI+obj.id;
                    savedItems.add(key);
                    var bodyText = 'data=' + encodeURIComponent(JSON.stringify(obj));
                    tx.capture(key, bodyText, 'application/json', dynamicMethods);
                    tx.commit();
                });
            })(o[i]);
        }
    }

    reviewer.POST = reviewer.PUT = function(request, response) {
        if (response.statusCode < 400)
            saveItem(request);
    }

    reviewer.DELETE = function(request, response) {
        if (response.statusCode < 400)
            releaseItem(request);
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


    // -------------------
    //   Synchronization
    // -------------------

    document.addEventListener('now-offline', function() {
        queue.reset();
    }, false);

    document.addEventListener('now-online', function() {
        var itemCount = 0;
        queue.process(itemCallback, successCallback);

        function itemCallback(uri, method) {
            console.log('itemCallback', uri, method);
            itemCount++;
            var tx = cache.transactionSync();
            var item = tx.cache.getItem(uri); // FIXME: Private API, needed because its synchronous...
            var xhr = new XMLHttpRequest();
            xhr.open(method, uri, false); // Synchronous for testing
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Bypass-DataCache', 'true'); // purposely avoid the DataCache!
            xhr.onload = function() { console.log('Xsuccess', xhr, xhr.responseText); }
            xhr.onerror = function() { console.log('Xerror', xhr, xhr.responseText); } // FIXME: in case of sync error
            xhr.send(item.body);
        }

        function successCallback() {
            console.log('successly resynchronized/updated %d items', itemCount);
            TwitterBox.Pull();
        }
    }, false);

})();
