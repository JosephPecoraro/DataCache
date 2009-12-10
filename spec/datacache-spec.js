// -----------
//   Globals
// -----------

var LATENCY = 500;

function basicEventChecker(type, object, flag, extra) {
    object[flag] = false;
    object[flag+'Event'] = false;
    window.addEventListener(type, function handler(event) {
        window.removeEventListener(type, handler, false);
        object[flag] = true;
        object[flag+'Event'] = event;
        if (extra)
            extra();
    }, false);
}


// --------------
//   Test Suite
// --------------

context('Basics', function() {
    should('have public methods', function() {
        ok(window.openDataCache !== undefined, "window.openDataCache exists");
    });

    should('have constants', function() {
        ok(typeof DataCache.IDLE === 'number', "DataCache.IDLE exists");
        ok(typeof DataCache.READY === 'number', "DataCache.IDLE exists");
        ok(typeof DataCache.OBSOLETE === 'number', "DataCache.IDLE exists");
    });
});


context('Resolving Absolute URLs', function() {
    var resolve = DataCache.resolveAbsoluteFromBase;
    var location = { href: 'http://example.com/foo/bar.txt', host: 'example.com' }

    should('resolve properly', function() {

        // Already Full
        ok(resolve(location, 'http://example.com/foo/bar.txt') === '/foo/bar.txt');
        ok(resolve(location, 'http://example.com/foo/bar/baz.txt') === '/foo/bar/baz.txt');

        // Absolute, from host
        ok(resolve(location, '/foo/bar.txt') === '/foo/bar.txt');
        ok(resolve(location, '/foo/bar/baz.txt') === '/foo/bar/baz.txt');

        // Relative from Current Directory
        ok(resolve(location, 'foo/bar.txt') === '/foo/foo/bar.txt');
        ok(resolve(location, 'foo/bar/baz.txt') === '/foo/foo/bar/baz.txt');

        // Relative with tricks
        ok(resolve(location, 'foo/../bar.txt') === '/foo/bar.txt');
        ok(resolve(location, 'foo/../bar/baz.txt') === '/foo/bar/baz.txt');
        ok(resolve(location, 'a/b/c/../../d/../../bar/baz.txt') === '/foo/bar/baz.txt');

        // Absolute + Relative attempt to go above host
        ok(resolve(location, '../../../bar.txt') === '/bar.txt');
        ok(resolve(location, '/../../../bar.txt') === '/bar.txt');

        // Strips the #hash fragment
        ok(resolve(location, 'foo/../bar.txt#hash') === '/foo/bar.txt');
        ok(resolve(location, 'http://example.com/foo/bar.txt#hash') === '/foo/bar.txt');

    });
});


context('Parsing Headers', function() {
    var parse = CacheTransaction.prototype.parseHeaders;
    var headersText = [
        'Date: Sun, 06 Dec 2009 05:19:04 GMT',     // typical data
        'Content-Encoding: gzip',                  // typical data
        'Content-Length: 3447',                    // typical data
        'Content-Type: text/html; charset=UTF-8',  // typical data
        'Cache-Control: private, max-age=0',       // typical data
        'X-Xss-Protection:   0',                   // ignore left pad after colon
        '  Server: gws',                           // ignore left pad
        '  ',                                      // ignore blank line
        'Expires: -2',                             // gets overwritten later on
        'Expires: -1'
    ].join("\n");

    should('create a nice object', function() {
        var obj = parse(headersText);
        ok(obj['Cache-Control'] === "private, max-age=0");
        ok(obj['Content-Encoding'] === "gzip");
        ok(obj['Content-Length'] === "3447");
        ok(obj['Content-Type'] === "text/html; charset=UTF-8");
        ok(obj['Date'] === "Sun, 06 Dec 2009 05:19:04 GMT");
        ok(obj['Expires'] === "-1");
        ok(obj['Server'] === "gws");
        ok(obj['X-Xss-Protection'] === "0");
    });
});


context('MutableHttpResponse setters', function() {
    var code = 200;
    var message = Http.Status[code];
    var body = 'Hello World!';

    var newCode = 410;
    var newMessage = Http.Status[code];
    var newBody = 'sample data';

    var headers = {
        'Date': 'Sun, 06 Dec 2009 05:19:04 GMT',
        'Content-Type': 'text/plain',
        'Content-Encoding': 'gzip'
    };

    function deepCopy(o) {
        return JSON.parse(JSON.stringify(o));
    }

    should('work as expected', function() {
        var resp = new MutableHttpResponse(code, message, body, deepCopy(headers));

        resp.setStatus(newCode, newMessage);
        resp.setResponseText(newBody);
        resp.setResponseHeader('X-New-Header', 'test');      // should create
        resp.setResponseHeader('Content-Type', 'text/html'); // should append

        ok(resp.statusCode === newCode);
        ok(resp.statusMessage === newMessage);
        ok(resp.bodyText === newBody);
        ok(resp.headers['X-New-Header'] === 'test');
        ok(resp.headers['Content-Type'] === 'text/plain, text/html');
    });

    should('not be mutable after dispatch', function() {
        var resp = new MutableHttpResponse(code, message, body, deepCopy(headers));

        resp.send();
        resp.setStatus(newCode, newMessage);
        resp.setResponseText(newBody);
        resp.setResponseHeader('X-New-Header', 'test');      // should create
        resp.setResponseHeader('Content-Type', 'text/html'); // should append

        ok(resp.statusCode === code);
        ok(resp.statusMessage === message);
        ok(resp.bodyText === body);
        ok(resp.headers['X-New-Header'] === undefined);
        ok(resp.headers['Content-Type'] === 'text/plain');
    });
});


context('DataCacheGroup/Host', function() {
    var cache = window.openDataCache();
    var version = cache.version;
    var group = cache.group;

    should('have window as the host', function() {
        equals(group.host.realHost, window, "window is host");
    });

    should('return most current for relativeCache', function() {
        var newCache = group.create();
        var newVersion = newCache.version;

        ok(cache.group === newCache.group, "Same Group");
        ok(version < newVersion, "Version are in the proper order");

        ok(group.effectiveCache !== newCache, "Effective is not Newest");
        ok(group.relevantCache  === newCache, "Relevant is Newest");
        group.remove(newCache);
        ok(group.effectiveCache === cache, "Effective is newest");
        ok(group.relevantCache  === cache, "Relevant is newest");
    });

    should('not be not be obsolete', function() {
        equals(group.obsolete, false, "Not obsolete");
    });
});


context('DataCache', function() {
    should('be the same', function() {
        ok(window.openDataCache() === window.openDataCache(), 'Same returned');
    });
});


context('Offline Transaction', function() {
    should('trigger off-line-updating event', function() {
        stop();

        var flags = {};
        basicEventChecker('off-line-updating', flags, 'firedOfflineUpdating');

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            flags.callbackFlag = true;
        });

        setTimeout(function() {
            ok(flags.callbackFlag, "did fire");
            ok(flags.firedOfflineUpdating, "did fire");
            ok(!!flags.firedOfflineUpdatingEvent, "new cache"); // which cache should this be?
            start();
        }); // no latency needed, these are all queued setTimeout's
    });
});


context('Offline Capture', function() {
    var body = 'Hello, World!';
    var uri = 'blah.html';

    should('capture, manage, and getItem a resource', function() {
        stop();

        var flags = {};
        basicEventChecker('captured', flags, 'firedCapturedEvent');

        var itemCallbackData = null;
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            ok(tx.offline);
            tx.capture(uri, body, 'text/plain', ['GET']);
            try { tx.getItem("DOESNOTEXIST", function() {}); }
            catch (e) { flags.exceptionNotFound = true; }
            tx.getItem(uri, function(item) {
                flags.calledItemCallback = true;
                itemCallbackData = item.body;
            });
        });

        function verify() {
            cache.swapCache();
            var item = window.openDataCache().getItem(uri);
            ok(item.body === body, "proper data");
            ok(item.readyState === CacheItem.CACHED);
            ok(item.body === itemCallbackData);
        }

        setTimeout(function() {
            ok(flags.firedCapturedEvent);
            ok(!!flags.firedCapturedEventEvent.cache);
            ok(!!flags.firedCapturedEventEvent.uri);
            ok(flags.exceptionNotFound);
            ok(flags.calledItemCallback);
            verify();
            start();
        }, LATENCY);
    });

    should('capture and release a resource', function() {
        stop();
        var txCache = null;

        var flags = {};
        basicEventChecker('captured', flags, 'firedCapturedEvent');
        basicEventChecker('released', flags, 'firedReleasedEvent');

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, 'text/plain', ['GET']);
            tx.release(uri);
            txCache = tx.cache;
        });

        setTimeout(function() {
            ok(flags.firedCapturedEvent, 'did fire');
            ok(!!flags.firedCapturedEventEvent.cache);
            ok(!!flags.firedCapturedEventEvent.uri);
            ok(flags.firedReleasedEvent, 'did fire');
            ok(!!flags.firedReleasedEventEvent.cache);
            ok(!!flags.firedReleasedEventEvent.uri);
            ok(txCache.getItem(uri).readyState === CacheItem.GONE, 'no longer stored');
            start();
        });
    });
});


context('Online Transaction', function() {
    var uri = 'data.txt';
    var body = 'Hello, World!';

    should('work asynchronously', function() {
        stop();

        var flags = {}
        basicEventChecker('updating', flags, 'firedUpdatingEvent');
        basicEventChecker('fetching', flags, 'firedFetchingEvent');

        var itemCallbackState = null;
        var cache = window.openDataCache();
        var txCache = null;
        cache.transaction(function(tx) {
            ok(!tx.offline);
            tx.capture(uri);
            try { tx.getItem("DOESNOTEXIST", function() {}); }
            catch (e) { flags.exceptionNotFound = true; }
            tx.getItem(uri, function(item) {
                flags.calledItemCallback = true;
                itemCallbackState = item.readyState;
            });
            txCache = tx.cache;
        });

        setTimeout(function() {
            ok(flags.firedUpdatingEvent);
            ok(!!flags.firedUpdatingEventEvent.cache);
            ok(flags.firedUpdatingEventEvent.uri === null);
            ok(flags.firedFetchingEvent);
            ok(!!flags.firedFetchingEventEvent.cache);
            ok(!!flags.firedFetchingEventEvent.uri);
            ok(flags.exceptionNotFound);
            ok(flags.calledItemCallback);
            ok(itemCallbackState === CacheItem.FETCHING);
            ok(txCache.getItem(uri).body === body);
            start();
        }, LATENCY);
    });

    should('work synchronously', function() {
        stop();

        var flags = {}
        basicEventChecker('updating', flags, 'firedUpdatingEvent');
        basicEventChecker('fetching', flags, 'firedFetchingEvent');

        var itemCallbackState = null, itemCallbackData = null;
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        ok(!tx.offline);
        tx.getItem(uri, function(item) { // carried over, now it exists
            flags.calledItemCallback = true;
            itemCallbackState = item.readyState;
            itemCallbackData = item.body;
        });
        tx.capture(uri);

        setTimeout(function() {
            ok(flags.firedUpdatingEvent);
            ok(!!flags.firedUpdatingEventEvent.cache);
            ok(flags.firedUpdatingEventEvent.uri === null);
            ok(flags.firedFetchingEvent);
            ok(!!flags.firedFetchingEventEvent.cache);
            ok(!!flags.firedFetchingEventEvent.uri);
            ok(flags.calledItemCallback);
            ok(itemCallbackState === CacheItem.CACHED);
            ok(itemCallbackData === body);
            var item = tx.cache.getItem(uri);
            ok(item.body === body);
            ok(item.readyState === CacheItem.CACHED);
            start();
        }, LATENCY);
    });

    should('have the same resources as the last online', function() {
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        ok(tx.cache.getItem(uri).body === body);
    });

    should('release a resource', function() {
        stop();

        var flags = {};
        basicEventChecker('released', flags, 'firedReleasedEvent');

        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        tx.release(uri);

        setTimeout(function() {
            ok(flags.firedReleasedEvent, 'did fire');
            ok(tx.cache.getItem(uri).readyState === CacheItem.GONE);
            start();
        });
    });

    should('be aborted', function() {
       stop();

       var flags = {};
       basicEventChecker('error', flags, 'firedErrorEvent');

       var cache = window.openDataCache();
       var tx = cache.transactionSync();
       tx.abort();

       setTimeout(function() {
           ok(flags.firedErrorEvent, 'did fire');
           ok(tx.status === CacheTransaction.ABORTED);
           start();
       });
    });

    should('trigger errorCallback', function() {
        stop();

        var calledErrorCallback = false;
        var cache = window.openDataCache();
        cache.transaction(
            function() { THISWILLCAUSEANERROR; },
            function() { calledErrorCallback = true; }
        );

        setTimeout(function() {
            ok(calledErrorCallback, 'did fire errorCallback');
            start();
        }, LATENCY);
    });

    should('trigger oncommitted after a commit (async)', function() {
        stop();

        var calledOncommitted = false;
        var cache = window.openDataCache();
        cache.transaction(function(tx) {
            tx.oncommitted = function() { calledOncommitted = true; }
            tx.commit();
        });

        setTimeout(function() {
            ok(calledOncommitted, 'did fire oncommitted');
            start();
        }, LATENCY);
    });

    should('trigger oncommitted after a commit (sync)', function() {
        stop();

        var calledOncommitted = false;
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        tx.oncommitted = function() { calledOncommitted = true; }
        tx.commit();

        setTimeout(function() {
            ok(calledOncommitted, 'did fire oncommitted');
            start();
        }, LATENCY);
    });
});


context('Local Server', function() {
    var uri = 'blah.txt';
    var body = 'none';
    var method = 'GET';

    should('return dynamic intercepted representations', function() {
        stop();

        DataCache.Offline = true;

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, null, [method]);
            cache.swapCache(); // bad practice
        });

        var interceptorCalled = false;
        var reviewerCalled = false;
        var headerName = 'X-Test';
        var headerValue = 'Test';
        var body = 'hello';

        function verify() {
            ok(xhr.status === 200);
            ok(xhr.statusText === Http.Status[200]);
            ok(xhr.responseText === body);
            ok(xhr.getResponseHeader(headerName) === headerValue);
            ok(xhr.getAllResponseHeaders().length > 0);
        }

        function interceptor(request, response) {
            interceptorCalled = true;
            ok(request.method === method);

            response.setStatus(200, Http.Status[200]);
            response.setResponseText(body);
            response.setResponseHeader(headerName, headerValue);
            response.send();
        }

        function reviewer() {
            reviewerCalled = true;
        }

        navigator.registerOfflineHandler(uri, interceptor, reviewer);

        var xhr = new InterceptableXMLHttpRequest();
        xhr.open(method, uri);
        xhr.onreadystatechange = verify;
        xhr.send();

        setTimeout(function() {
            ok(interceptorCalled);
            ok(!reviewerCalled);
            start();
        });
    });

    should('return dynamic reviewed representations', function() {
        stop();
        // FIXME: Implement test!
        setTimeout(function() {
            start();
        });
    });
});


context('Online Transaction with 4xx or 5xx error', function() {
    var uri = 'code.php?code=500';
    should('fire error event', function() {
        stop();

        var flags = {};
        basicEventChecker('error', flags, 'firedErrorEvent');

        var cache = window.openDataCache();
        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(flags.firedErrorEvent, "did fire");
            start();
        }, LATENCY);
    });
});


context('Online Transaction with 401', function() {
    var uri = 'code.php?code=401';
    var cache = window.openDataCache();

    should('make fire obsolete event and make obsolete', function() {
        stop();

        var flags = {};
        basicEventChecker('obsolete', flags, 'firedObsoleteEvent');

        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(flags.firedObsoleteEvent, "did fire");
            ok(!!flags.firedObsoleteEventEvent.cache);
            ok(flags.firedObsoleteEventEvent.uri === null);
            ok(cache.group.status === DataCache.OBSOLETE, "group became obsolete");
            start();
        }, LATENCY);
    });
});
