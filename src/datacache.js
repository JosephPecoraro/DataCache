/*
 * DataCache API
 * Joseph Pecoraro
 */


// ---------------------------
//   Object Oriented Helpers
// ---------------------------

// Valid for WebKit and Firefox, the supported browsers
function subclass(child, parent) {
    child.prototype.__proto__ = parent.prototype;
}

// Deep copy an object
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}


// -------------
//   DataCache
// -------------

function DataCache(group, origin, version) {
    this.group = group;
    this.origin = origin;
    this.completeness = 'incomplete';
    this.version = version || 0;

    this.managed = {};
}

DataCache.IDLE = 0;
DataCache.READY = 1;
DataCache.OBSOLETE = 2;
DataCache.UPDATING = 3; // Hidden (non-standard)

DataCache.prototype = {
    get requiredCookie() {
        return undefined;
    },

    _createCacheTransaction: function(group, offline) {
        if (group.obsolete)
            throw 'DataCache: Cache Group is obsolete.';

        if (!offline) {
            if (group.status === DataCache.UPDATING)
                throw 'DataCache: a cache transaction is already open on this data cache group.';
            group.status = DataCache.UPDATING;
        }

        if (offline) {
            var newCache = group.create();
            var tx = new OfflineTransaction(newCache);
            this.queueCacheEvent('off-line-updating');
            return tx;
        } else {
            var newCache = group.createLikeRelevant();
            var tx = new OnlineTransaction(newCache);
            this.queueCacheEvent('updating');
            return tx;
        }
    },

    queueCacheEvent: function(type) {
        this.group.host.queueTask(type, this, null);
    },

    _handleTransaction: function(transaction, callback, errorCallback) {
        if (callback) {
            var host = this.group.host;
            setTimeout(function(tx) {
                try { callback.call(host, tx); }
                catch (e) {
                    if (errorCallback) {
                        setTimeout(function() {
                            errorCallback.call(host);
                        }, 0);
                    }
                }
            }, 0, transaction);
        }
    },

    transaction: function(callback, errorCallback) {
        var tx = this._createCacheTransaction(this.group, false);
        this._handleTransaction(tx, callback, errorCallback);
    },

    offlineTransaction: function(callback, errorCallback) {
        var tx = this._createCacheTransaction(this.group, true);
        this._handleTransaction(tx, callback, errorCallback);
    },

    transactionSync: function() {
        return this._createCacheTransaction(this.group, false);
    },

    swapCache: function() {
        this.group.effectiveCache = this.group.relevantCache;
    },

    eachModificationSince: function(version, callback, successCallback) {
        this.group.eachModificationFromTo(this.version, version, callback, successCallback);
    },

    manage: function(uri, resource) {
        this.managed[uri] = resource;
    },

    removeItem: function(uri) {
        var resolved = DataCache.resolveAbsoluteFromBase(window.location, uri);
        this.removeItemResolved(resolved);
    },

    removeItemResolved: function(resolvedURI) {
        delete this.managed[resolvedURI];
    },

    getItem: function(uri) {
        var resolved = DataCache.resolveAbsoluteFromBase(window.location, uri);
        return this.getItemResolved(resolved);
    },

    getItemResolved: function(resolvedURI) {
        var item = this.managed[resolvedURI];
        if (!item)
            throw 'DataCache: no such item'; // FIXME: raise NOT_FOUND_ERR

        return item;
    }
}


// -------------------------------
//   Global Functions and Values
// -------------------------------

DataCache.GlobalHost = null; // set later
DataCache.Offline = false;   // set as determined

// TODO: make an XHR request for the current page to determine offline status
// also, store data in sessionStorage (and timestamp) to carry such data along.

DataCache.resolveAbsoluteFromBase = function(location, uri) {

    // Remove scheme if it exists
    function stripScheme(s) {
        return (s.match(/^.*?:\/\//) ? s.substring(s.indexOf('://')+3) : s);
    }

    // Remove host if it exists
    function stripHost(s) {
        return (s.indexOf(host) === 0 ? s.substring(host.length) : s);
    }

    // Remove fragment if it exists
    function stripFragment(s) {
        var hashIndex = s.indexOf('#');
        return (hashIndex !== -1 ? s.substring(0, hashIndex) : s);
    }

    // Combined
    function stripComponents(s) {
        return stripFragment(stripHost(stripScheme(s)));
    }

    // on page: http://example.com/foo/bar.txt
    //   host       => example.com
    //   currentDir => example.com/foo/
    var host = location.host;
    var currentDir = location.href.substring(0, location.href.lastIndexOf('/')+1);
    currentDir = stripComponents(currentDir);
    uri = stripComponents(uri);

    //  The result may start with an absolute path from the root
    //  or a relative path from the current directory
    var str = '';
    if (uri.charAt(0) === '/')
        uri = uri.substring(1);
    else {
        if (currentDir.charAt(currentDir.length-1) == '/')
            str = currentDir.substring(0, currentDir.length-1);
        else
            str = currentDir; // This case is not tested... location.href doesn't end in a slash? can browsers do this?
    }

    // Handle remaining sections
    //   .. means move up a directory
    //   anything else means append a new directory/part
    var parts = uri.split('/');
    for (var i=0, len=parts.length; i<len; ++i) {
        var part = parts[i];
        if (part.length === 0)
            continue;

        switch (part) {
            case '..':
                str = str.substring(0, str.lastIndexOf('/'));
                break;
            default:
                str += '/' + part;
                break;
        }
    }

    // Return absolute representation
    return str;
}


// --------------------------------
//   CacheTransaction (Interface)
// --------------------------------

function CacheTransaction(cache) {
    this.cache = cache;
    this.status = CacheTransaction.PENDING;
    this.oncommitted = function() {};
}

CacheTransaction.prototype = {
    getItem: function(uri, callback) {
        var item = this.cache.getItem(uri);
        setTimeout(function() {
            callback.call(this, item);
        }, 0);
    },

    release: function(uri) {
        if (this.status !== CacheTransaction.PENDING)
            throw "CacheTransaction: can only capture a PENDING transaction";

        var cache = this.cache;
        var host = cache.group.host;

        var location = host.realHost.location; // NOTE: realHost is always window
        this._checkURI(location, uri);
        var absoluteURI = DataCache.resolveAbsoluteFromBase(location, uri);

        var item = cache.getItem(absoluteURI); // will throw an error if not found
        cache.manage(absoluteURI, new CacheItem(CacheItem.GONE));
        cache.group.host.queueTask('released', cache, absoluteURI);
    },

    commit: function() {
        if (this.status !== CacheTransaction.PENDING)
            throw "CacheTransaction: can only capture a PENDING transaction";

        var cache = this.cache;
        var group = cache.group;

        group.update(cache);
        this.status = CacheTransaction.COMMITTED; // ?!?!

        // FIXME: make commitSubsteps
        if (this.offline)
            group.effectiveCache = cache;
        else
            group.status = DataCache.IDLE;
        // FIXME: special queueTask?

        if (this.oncommitted) {
            var self = this;
            setTimeout(function() {
                self.oncommitted.call(self);
            }, 0);
        }
    },

    _capture: function(uri, host, tx, methods, content, contentType) {
        if (tx.status !== CacheTransaction.PENDING)
            throw "CacheTransaction: can only capture a PENDING transaction";

        var location = host.realHost.location; // NOTE: realHost is always window
        this._checkURI(location, uri);
        var absoluteURI = DataCache.resolveAbsoluteFromBase(location, uri);

        var cache = tx.cache;
        cache.removeItemResolved(absoluteURI);
        this._captureSubsteps(absoluteURI, methods, content, contentType);
    },

    _checkURI: function(location, uri) {

        // Remove scheme if it exists
        function stripScheme(s) {
            return (s.match(/^.*?:\/\//) ? s.substring(s.indexOf('://')+3) : s);
        }

        // Check scheme
        var m = uri.match(/^(\w+):\/\//);
        if (m && m[1] !== location.protocol)
            throw "CacheTransaction: scheme change in attempted cache";

        // Check host
        if (m) {
            uri = stripScheme(uri);
            var host = uri.substring(0, uri.indexOf('/'));
            if (host !== location.host)
                throw "CacheTransaction: host change in attempted cache";
        }

    },

    parseHeaders: function(headersText) {
        if (!headersText)
            return {};

        // Remove leading whitespace
        function trimLeft(s) {
            return s.replace(/^\s+/, '');
        }

        // Convert HTTP key/value pairs into a hash
        var headers = {};
        var lines = headersText.split(/\n/);
        for (var i=0, len=lines.length; i<len; ++i) {
            var line = trimLeft(lines[i]);
            var colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                var key = line.substring(0, colonIndex);
                var value = trimLeft(line.substring(colonIndex+1));
                headers[key] = value;
            }
        }

        return headers;
    }
};

CacheTransaction.PENDING   = 0;
CacheTransaction.COMMITTED = 1;
CacheTransaction.ABORTED   = 2;


// ---------------------
//   OnlineTransaction
// ---------------------

function OnlineTransaction(cache) {
    CacheTransaction.call(this, cache);
}

OnlineTransaction.prototype = {
    get offline() {
        return false;
    },

    capture: function(uri, dynamicMethods) {
        this._capture(uri, this.cache.group.host, this, dynamicMethods);
    },

    abort: function() {
        if (this.status !== CacheTransaction.PENDING)
            throw 'CacheTransaction: cannot abort a non-PENDING transaction';
        this.cache.group.remove(this.cache);
        this.status = CacheTransaction.ABORTED;
        this.cache.queueCacheEvent('error');
    },

    _captureSubsteps: function(uri, methods) {
        this.cache.group.host.queueTask('fetching', this.cache, uri);

        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open("GET", uri); // asynchronous
        xhr.onreadystatechange = function() {
            // Workaround for local file XHRs
            var statusCanBeZero = /^file/.test(window.location.protocol);
            if (xhr.readyState === 4) {
                if (xhr.status === 200 || (statusCanBeZero && xhr.status === 0))
                    self._captureSuccess(xhr, uri, methods);
                else
                    self._captureFailure(xhr);
            }
        }
        xhr.send();

        var item = new CacheItem(CacheItem.FETCHING);
        this.cache.manage(uri, item);
    },

    _captureSuccess: function(xhr, uri, methods) {
        console.log('success', xhr);
        var body = xhr.responseText; // FIXME: binary?
        var type = xhr.getResponseHeader('Content-Type'); // FIXME: determine from filetype as well?
        var headers = this.parseHeaders(xhr.getAllResponseHeaders());
        var item = new CacheItem(CacheItem.CACHED, body, type, methods, headers);
        this.cache.manage(uri, item);
        this.cache.group.host.queueTask('captured', this.cache, uri);
    },

    _captureFailure: function(xhr) {
        console.log('failure', xhr);
        this.cache.group.remove(this.cache);
        this.status = CacheTransaction.ABORT;
        if (xhr.status !== 401) {
            this.cache.queueCacheEvent('error');
        } else {
            this.cache.group.status = DataCache.OBSOLETE;
            this.cache.queueCacheEvent('obsolete');
        }
    }
}

subclass(OnlineTransaction, CacheTransaction);


// ----------------------
//   OfflineTransaction
// ----------------------

function OfflineTransaction(cache) {
    CacheTransaction.call(this, cache);
}

OfflineTransaction.prototype = {
    get offline() {
        return true;
    },

    capture: function(uri, body, contentType, dynamicMethods) {
        this._capture(uri, this.cache.group.host, this, dynamicMethods, body, contentType);
    },

    _captureSubsteps: function(uri, methods, content, contentType) {
        var item = new CacheItem(CacheItem.CACHED, content, contentType, methods);
        this.cache.manage(uri, item);
        this.cache.group.host.queueTask('captured', this.cache, uri);
    }
}

subclass(OfflineTransaction, CacheTransaction);


// -------------
//   CacheItem
// -------------

function CacheItem(readyState, body, type, dynamicMethods, headers) {
    this.readyState = readyState;
    this.body = body;
    this.type = (type || 'text/plain');
    this.dynamicMethods = dynamicMethods || [];
    this.headers = (headers || {});
}

CacheItem.UNCACHED = 0;
CacheItem.FETCHING = 1;
CacheItem.CACHED = 2;
CacheItem.GONE = 3;


// -------------------------
//   Embedded Local Server
// -------------------------

function LocalServer(namespace, interceptFunc, reviewerFunc) {
    this.namespace = DataCache.resolveAbsoluteFromBase(window.location, namespace);
    this.interceptor = interceptFunc;
    this.reviewer = reviewerFunc;
}

LocalServer.prototype = {
    specificityForURI: function(resolvedURI) {
        // Example:
        //   local server namespace: /foo
        //   requested uri:          /foo/bar.txt
        return (resolvedURI.indexOf(this.namespace) === 0 ? this.namespace.length : 0);
    }
};


// ---------------------
//   Interceptor Parts
// ---------------------

function HttpRequest(method, target, bodyText, headers) {
    this.method = method;
    this.target = target;
    this.bodyText = bodyText;
    this.headers = headers;
}

function HttpResponse(statusCode, statusMessage, bodyText, headers) {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.bodyText = bodyText;
    this.headers = headers;
}


// ---------------------
//   Mutable Response
// ---------------------

function MutableHttpResponse(statusCode, statusMessage, bodyText, headers) {
    HttpResponse.call(this, statusCode, statusMessage, bodyText, headers);
    this._dispatched = false;
}

MutableHttpResponse.prototype = {
    setStatus: function(code, message) {
        if (this._dispatched)
            return;
        this.statusCode = code;
        this.statusMessage = message;
    },

    setResponseText: function(text) {
        if (this._dispatched)
            return;
        this.bodyText = text;
    },

    setResponseHeader: function(name, value) {
        if (this._dispatched)
            return;
        if (name in this.headers) {
            // Append to the Http Header
            // The append character is a comma, whitespace
            // is ignored after the comma.
            this.headers[name] += ', ' + value;
        } else {
            this.headers[name] = value;
        }
    },

    send: function() {
        if (this._dispatched)
            return;
        this._dispatched = true;
    }
};


// ----------------
//   Http Globals
// ----------------

var Http = {};

Http.Status = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Moved Temporarily',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Time-out',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Request Entity Too Large',
  414: 'Request-URI Too Large',
  415: 'Unsupported Media Type',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Time-out',
  505: 'HTTP Version not supported'
};


// -----------------------
//   CacheEvent (unused)
// -----------------------

function CacheEvent() {
    this.cache = null;
    this.uri = null;
}

CacheEvent.prototype = {
    __proto__: Event.prototype
}; // semicolon is required


// -------------------------------------
//   Override Default Browser Behavior
// -------------------------------------

(function() {

    // Create Event should recognize CacheEvent
    var _createEvent = document.createEvent;
    document.createEvent = function(type) {
        switch (type) {
            case "CacheEvent":
                return _createEvent.call(document, 'Event'); // for compatibility this must be "Event"
            default:
                return _createEvent.apply(document, arguments);
        }
    }

    Event.prototype.initCacheEvent = function(cache, uri) {
        this.cache = cache;
        this.uri = uri;
    };

    Event.prototype.initCacheEventNS = function(namespaceURI, cache, uri) {
        // FIXME: namespace is ignored
        this.initCacheEvent(cache, uri);
    }

})();



(function() {

    // ------------------------------------------
    //   DataCacheHost (private) (non-standard)
    // ------------------------------------------

    function DataCacheHost(realHost) {
        this.realHost = realHost; // always window for this library
        this.servers = [];
        this.groups = [];
    }

    DataCacheHost.prototype = {
        queueTask: function(type, cache, uri) {
            var event = document.createEvent('CacheEvent');
            event.initEvent(type, false, false);
            event.initCacheEvent(cache, uri);
            this.realHost.dispatchEvent(event);
        },

        addGroup: function(group) {
            this.groups.push(group);
        },

        addLocalServer: function(server) {
            this.servers.push(server);
        },

        handleRequest: function(xhr, method, uri, data, headers) {

            // Immediate return if a bypass header is set
            if (headers['X-Bypass-DataCache'] === 'true')
                return false;

            // NOTE: known to be only one group, may change in the future
            var item = null;
            var cache = this.groups[0].effectiveCache; // I FEEL THIS IS NOT ENOUGH... Online+Offline checks?
            try { item = cache.getItem(uri); } catch (e) {}
            if (!item)
                return false;

            // Captured but not yet ready
            if (item.readyState !== CacheItem.CACHED)
                return false;

            // Non Dynamic Request, pull from cache, represent as a response
            if (item.dynamicMethods.indexOf(method) === -1)
                return new HttpResponse(200, Http.Status[200], item.body, item.headers);

            // Find Specific Candidate Server
            var resolvedURI = DataCache.resolveAbsoluteFromBase(window.location, uri);
            var server = this._candidateServerForUri(resolvedURI);
            if (!server)
                throw "DataCache: missing local server to create a dynamic request";

            // Create the Request
            var request = new HttpRequest(method, resolvedURI, data, headers);

            // Offline => Mutable Response for the interceptor
            if (DataCache.Offline) {
                var mutableResponse = new MutableHttpResponse(0, '', '', {});
                server.interceptor(request, mutableResponse); // reference will get modified
                if (!mutableResponse._dispatched) // undefined
                    console.error('DataCache: a MutableHttpResponse was intercepted and modified without send(). Using as is.');
                return mutableResponse;
            }

            // Set a Timer to artifically determine if we are Online/Offline
            // FIXME: to implement

            // Issue the XHR and invoke the reviewer
            // FIXME: to implement

            // pass through for now
            return false;
        },

        _candidateServerForUri: function(resolvedURI) {
            var maxLength = -1;
            var candidate = null;
            for (var i=0, len=this.servers.length; i<len; ++i) {
                var specificity = this.servers[i].specificityForURI(resolvedURI);
                if (specificity > 0 && specificity > maxLength)
                    candidate = this.servers[i];
            }

            return candidate;
        },
    }

    // -------------------------------------------
    //   DataCacheGroup (private) (non-standard)
    // -------------------------------------------

    function DataCacheGroup(host, origin) {
        this.host = host;
        this.origin = origin;
        this.status = DataCache.IDLE;
        this.versions = {};
        this._nextVersion = 0;
        this._effectiveCache = null;

        DataCache.GlobalHost.addGroup(this);
    }

    DataCacheGroup.prototype = {
        get obsolete() {
            return this.status === DataCache.OBSOLETE;
        },

        get relevantCache() {
            var highestVersion = this._nextVersion - 1;
            while (highestVersion >= 0) {
                if (highestVersion in this.versions)
                    return this.versions[highestVersion];
                highestVersion--;
            }

            return this.create();
        },

        get effectiveCache() {
            if (!this._effectiveCache)
                this._effectiveCache = this.relevantCache;

            return this._effectiveCache;
        },

        set effectiveCache(x) {
            this._effectiveCache = x;
        },

        add: function(cache) {
            if (!cache)
                throw 'DataCache: you may only add a valid cache to a cache group.';

            this.versions[cache.version] = cache;
        },

        create: function() {
            var cache = new DataCache(this, this.origin, this._nextVersion);
            this._nextVersion++;
            this.add(cache);
            this.status = DataCache.IDLE;
            DataCacheGroupController.save(this);
            return cache;
        },

        createLikeRelevant: function() {
            var relevant = this.relevantCache;
            var cache = this.create();
            cache.managed = deepCopy(relevant.managed);
            return cache;
        },

        remove: function(cache) {
            if (cache.group !== this || this.versions[cache.version] !== cache)
                return;

            delete this.versions[cache.version];
            if (this._effectiveCache === cache)
                this._effectiveCache = null; // NOTE: will become relevant cache
        },

        update: function(cache) {
            var oldVersion = cache.version;
            var newVersion = this._nextVersion;
            cache.version = newVersion;
            delete this.versions[oldVersion];
            this.versions[newVersion] = cache;
            this._nextVersion++;
        },

        eachModificationFromTo: function(highVersion, lowVersion, callback, successCallback) {
            var additions = [];
            var removals = [];

            var currentCache = this.versions[highVersion];
            // FIXME: need to know what was added/removed (readyState)

            var olderCache = this._nextLowerCache(highVersion);
            while (olderCache) {
                // FIXME: need to know what was added/removed (readyState)
                olderCache = this._nextLowerCache(olderCache.version);
            }

            if (callback) {
                for (var i=0, len=additions.length; i<len; ++i)
                    setTimeout(callback, 0, additions[i], 'addition');
                for (var i=0, len=additions.length; i<len; ++i)
                    setTimeout(callback, 0, additions[i], 'removal');
            }

            if (successCallback)
                successCallback.call(this);
        },

        _nextLowerCache: function(version) {
            for (var i=(version-1); i>0; --i) {
                if (this.versions[i])
                    return this.versions[i];
            }

            return null;
        }
    }


    // --------------------------------------------
    //   DataCacheGroupController (save-and-load)
    // --------------------------------------------

    DataCacheGroupController = {
        key: 'datacachegroup',

        load: function() {
            var jsonString = window.localStorage[DataCacheGroupController.key];
            if (!jsonString)
                return;

            // TODO: Handle managed resources
            var savedObj = JSON.parse(jsonString);
            var host = this._createDataCacheHost();
            var group = this._createDataCacheGroup(host, window.location.host);
            for (var i in savedObj.v) {
                var v = savedObj.v[i];
                group.versions[i] = this._createDataCache(group, v.origin, v.version, v.completeness);
            }

            return group;
        },

        save: function(group) {
            // TODO: Handle local servers in CacheHost (they are functions...)
            // TODO: Handle managed resources in DataCache
            var savedObj = { _nextVersion: group._nextVersion, v: {} };
            for (var i in group.versions) {
                var version = group.versions[i];
                savedObj.v[i] = {
                    origin: version.origin,
                    completeness: version.completeness,
                    version: version.version
                };
            }

            var jsonString = JSON.stringify(savedObj);
            // FIXME: reenable later one
            // window.localStorage[DataCacheGroupController.key] = jsonString;
        },

        _createDataCache: function(group, origin, version, completeness) {
            var cache = new DataCache(group, origin, version);
            cache.completeness = completeness;
            return cache;
        },

        _createDataCacheHost: function() {
            return new DataCacheHost(window);
        },

        _createDataCacheGroup: function(host, origin) {
            return new DataCacheGroup(host, origin);
        }
    }


    // ---------------------
    //   Setup Information
    // ---------------------
    var origin = window.location.host;
    var host = new DataCacheHost(window);
    DataCache.GlobalHost = host;


    // -----------------------
    //   Load DataCacheGroup
    // -----------------------
    var group = DataCacheGroupController.load();
    if (!group)
        group = new DataCacheGroup(host, origin);


    // ---------------
    //   Public APIs
    // ---------------

    window.openDataCache = function openDataCache(cookieName) {
        var isSecure = (typeof cookieName !== 'undefined');
        if (isSecure)
            throw 'DataCache: The JavaScript Library cannot reliably handle secure DataCaches';

        return group.effectiveCache;
    }

    navigator.registerOfflineHandler = function registerOfflineHandler(namespace, intercept, review) {
        // FIXME: host?
        DataCache.GlobalHost.addLocalServer(new LocalServer(namespace, intercept, review));
    }

})();


/*
 * FIXME: Possible Solution
 * Overwrite Default XMLHttpRequest behavior through
 * monkey patching, to sneak information?
 */

// -------------------------------
//   InterceptableXMLHttpRequest
// -------------------------------

function InterceptableXMLHttpRequest() {

    // Internal request and values
    var xhr = this.xhr = new XMLHttpRequest();

    // Internal State
    this._handled = false;
    this._headers = {};

    // Generate functions with non-closured values
    function genericApply(func) { return function() { return xhr[func].apply(xhr, arguments); } };
    function createGetter(func) { return function() { return xhr[func]; } };
    function createSetter(func) { return function(handler) { xhr[func] = handler; } };

    // Pass through Interface, with the exception of some
    // NOTE: Getters / Setters need special handling
    var exceptions = ['open', 'send', 'setRequestHeader', 'getAllResponseHeaders', 'getResponseHeader'];
    var getters = ['status', 'readyState', 'responseXML', 'responseText', 'statusText'];

    for (var func in this.xhr) {
        if (!this.xhr.hasOwnProperty(func))
            continue;

        if (exceptions.indexOf(func) === -1) {
            if (getters.indexOf(func) !== -1 || func.indexOf("on") === 0) {
                this.__defineGetter__(func, createGetter(func));
                this.__defineSetter__(func, createSetter(func));
            } else {
                this[func] = genericApply(func);
            }
        }
    }

};

InterceptableXMLHttpRequest.prototype = {
    open: function(method, uri, async) {
        this._method = method;
        this._uri = uri;
        this._async = (async === false ? false : true);

        // pass through
        this.xhr.open.apply(this.xhr, arguments);
    },

    send: function(data) {
        var self = this;
        function action() {
            var response = DataCache.GlobalHost.handleRequest(self.xhr, self._method, self._uri, data, self._headers);
            delete self._headers;
            delete self._method;
            delete self._async;
            delete self._uri;
            if (response) {
                self.handleHttpResponse(response);
                return;
            }

            // pass through
            self.xhr.send.apply(self.xhr, arguments);
        }

        if (this._async)
            setTimeout(action, 0);
        else
            action();
    },

    handleHttpResponse: function(response) {
        delete this.status;
        delete this.statusText;
        delete this.readyState;
        delete this.responseText;

        this._handled = true;
        this._headers = response.headers;

        this.status = response.statusCode;
        this.statusText = response.statusMessage;
        this.readyState = 4; // success
        this.responseText = response.bodyText;
        this.onreadystatechange(null);
    },

    getAllResponseHeaders: function() {
        if (this._handled)
            return this._headersAsString();
        return this.xhr.getAllResponseHeaders.apply(this.xhr, arguments);
    },

    getResponseHeader: function(name) {
        if (this._handled)
            return this._headers[name];
        return this.xhr.getResponseHeader.apply(this.xhr, arguments);
    },

    setRequestHeader: function(name, value) {
        this._headers[name] = value;
        this.xhr.setRequestHeader.apply(this.xhr, arguments);
    },

    _headersAsString: function() {
        var arr = [];
        for (var name in this._headers)
            arr.push(name + ': ' + this._headers[name]);
        return arr.join("\n");
    }
}
