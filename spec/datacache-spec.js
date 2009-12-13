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
        ok(window.openDataCache !== undefined, 'window.openDataCache exists');
        ok(navigator.registerOfflineHandler !== undefined, 'window.registerOfflineHandler exists');
    });

    should('have constants', function() {
        ok(typeof DataCache.IDLE === 'number', 'DataCache.IDLE exists');
        ok(typeof DataCache.READY === 'number', 'DataCache.IDLE exists');
        ok(typeof DataCache.OBSOLETE === 'number', 'DataCache.IDLE exists');
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
    var parse = DataCache.parseHeaders;
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
        ok(resp.statusMessage === 'HTTP/1.1 ' + newMessage); // note HTTP was added in the Response
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
        ok(resp.statusMessage === 'HTTP/1.1 ' + message);    // note HTTP was added in the Response
        ok(resp.bodyText === body);
        ok(resp.headers['X-New-Header'] === undefined);
        ok(resp.headers['Content-Type'] === 'text/plain');
    });

    should('not double add HTTP to status', function() {
        var message = 'HTTP/1.1 TEST';
        var resp = new MutableHttpResponse(code, message, body, {});
        resp.send();
        ok(resp.statusMessage.length === message.length);
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
        ok(window.openDataCache() === window.openDataCache(), 'Same cache returned');
    });
});


context('Offline Transaction', function() {
    should('trigger off-line-updating event', function() {
        stop(); expect(3);

        var flags = {};
        basicEventChecker('off-line-updating', flags, 'firedOfflineUpdating');

        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            flags.callbackFlag = true;
        });

        setTimeout(function() {
            ok(flags.callbackFlag, "did fire callback");
            ok(flags.firedOfflineUpdating, "did fire off-line-updating event");
            ok(!!flags.firedOfflineUpdatingEvent, "fired event had a cache");
            start();
        }); // no latency needed, these are all queued setTimeout's
    });
});


context('Offline Capture', function() {
    var body = 'Hello, World!';
    var uri = 'blah.html';

    should('capture, manage, and getItem a resource', function() {
        stop(); expect(9);

        var flags = {};
        basicEventChecker('captured', flags, 'firedCapturedEvent');

        var itemCallbackData = null;
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            ok(tx.offline, 'transaction is offline');
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
            ok(flags.firedCapturedEvent, 'fired captured event');
            ok(!!flags.firedCapturedEventEvent.cache, 'fired event had a cache');
            ok(!!flags.firedCapturedEventEvent.uri), 'fired event had a uri';
            ok(flags.exceptionNotFound), 'throws and exception when getItem is not found';
            ok(flags.calledItemCallback, 'called the item callback');
            verify();
            start();
        }, LATENCY);
    });

    should('capture and release a resource', function() {
        stop(); expect(7);
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
            ok(flags.firedCapturedEvent, 'fired captured event');
            ok(!!flags.firedCapturedEventEvent.cache, 'fired event had a cache');
            ok(!!flags.firedCapturedEventEvent.uri, 'fired event had a uri');
            ok(flags.firedReleasedEvent, 'fired released event');
            ok(!!flags.firedReleasedEventEvent.cache, 'fired event had a cache');
            ok(!!flags.firedReleasedEventEvent.uri, 'fired event had a uri');
            ok(txCache.getItem(uri).readyState === CacheItem.GONE, 'no longer stored');
            start();
        });
    });
});


context('Online Transaction', function() {
    var uri = 'data.txt';
    var body = 'Hello, World!';

    should('work asynchronously', function() {
        stop(); expect(11);

        var flags = {}
        basicEventChecker('updating', flags, 'firedUpdatingEvent');
        basicEventChecker('fetching', flags, 'firedFetchingEvent');

        var itemCallbackState = null;
        var cache = window.openDataCache();
        var txCache = null;
        cache.transaction(function(tx) {
            ok(!tx.offline, 'transaction is online');
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
            ok(flags.firedUpdatingEvent, 'fired updating event');
            ok(!!flags.firedUpdatingEventEvent.cache, 'fired event had a cache');
            ok(flags.firedUpdatingEventEvent.uri === null, 'fired event did not have a uri');
            ok(flags.firedFetchingEvent, 'fired fetching event');
            ok(!!flags.firedFetchingEventEvent.cache, 'fired event had a cache');
            ok(!!flags.firedFetchingEventEvent.uri, 'fired event had a uri');
            ok(flags.exceptionNotFound, 'throws exception on getItem on no exist');
            ok(flags.calledItemCallback, 'called item callback');
            ok(itemCallbackState === CacheItem.FETCHING, 'status of the resource is fetching');
            ok(txCache.getItem(uri).body === body, 'proper data');
            start();
        }, LATENCY);
    });

    should('work synchronously', function() {
        stop(); expect(12);

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
            ok(flags.firedUpdatingEvent, 'fired updating event');
            ok(!!flags.firedUpdatingEventEvent.cache, 'fired event had a cache');
            ok(flags.firedUpdatingEventEvent.uri === null, 'fired event did not have a uri');
            ok(flags.firedFetchingEvent, 'fired fetching event');
            ok(!!flags.firedFetchingEventEvent.cache, 'fired event had a cache');
            ok(!!flags.firedFetchingEventEvent.uri, 'fired event had a uri');
            ok(flags.calledItemCallback, 'called item callback');
            ok(itemCallbackState === CacheItem.CACHED, 'status of the resource is catched');
            ok(itemCallbackData === body, 'proper data in the item callback');

            var item = tx.cache.getItem(uri);
            ok(item.body === body, 'proper data when pulled from a transaction');
            ok(item.readyState === CacheItem.CACHED, 'proper state when pulled from a transaction');
            start();
        }, LATENCY);
    });

    should('have the same resources as the last online', function() {
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        ok(tx.cache.getItem(uri).body === body, 'proper data');
    });

    should('release a resource', function() {
        stop(); expect(2);

        var flags = {};
        basicEventChecker('released', flags, 'firedReleasedEvent');

        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        tx.release(uri);

        setTimeout(function() {
            ok(flags.firedReleasedEvent, 'fired released event');
            ok(tx.cache.getItem(uri).readyState === CacheItem.GONE, 'item was released');
            start();
        });
    });

    should('be aborted', function() {
       stop(); expect(2);

       var flags = {};
       basicEventChecker('error', flags, 'firedErrorEvent');

       var cache = window.openDataCache();
       var tx = cache.transactionSync();
       tx.abort();

       setTimeout(function() {
           ok(flags.firedErrorEvent, 'fired abort event');
           ok(tx.status === CacheTransaction.ABORTED, 'transaction was marked as aborted');
           start();
       });
    });

    should('trigger errorCallback', function() {
        stop(); expect(1);

        var calledErrorCallback = false;
        var cache = window.openDataCache();
        cache.transaction(
            function() { THISWILLCAUSEANERROR; },
            function() { calledErrorCallback = true; }
        );

        setTimeout(function() {
            ok(calledErrorCallback, 'called error callback on transaction error');
            start();
        }, LATENCY);
    });

    should('trigger oncommitted after a commit (async)', function() {
        stop(); expect(1);

        var calledOncommitted = false;
        var cache = window.openDataCache();
        cache.transaction(function(tx) {
            tx.oncommitted = function() { calledOncommitted = true; }
            tx.commit();
        });

        setTimeout(function() {
            ok(calledOncommitted, 'fire oncommitted function on transaction commit');
            start();
        }, LATENCY);
    });

    should('trigger oncommitted after a commit (sync)', function() {
        stop(); expect(1);

        var calledOncommitted = false;
        var cache = window.openDataCache();
        var tx = cache.transactionSync();
        tx.oncommitted = function() { calledOncommitted = true; }
        tx.commit();

        setTimeout(function() {
            ok(calledOncommitted, 'fire oncommitted function on transaction commit');
            start();
        }, LATENCY);
    });
});


context('DataCache eachModificationSince', function() {
    should('return all cached files', function() {
        stop(); expect(5);

        // Counters / Test States
        var itemCb1 = 0;
        var itemCb2 = 0;
        var deletedCount = 0;
        var calledSuccessCallback1 = false;
        var calledSuccessCallback2 = false;
        function successCallback1() { calledSuccessCallback1 = true; }
        function successCallback2() { calledSuccessCallback2 = true; }
        function itemCallback2(item, uri) { itemCb2++; }
        function itemCallback1(item, uri) {
            itemCb1++;
            if (item.readyState === CacheItem.GONE)
                deletedCount++;
        }

        // Pick our own range of change versions
        window.openDataCache().swapCache();
        var cache = window.openDataCache();

        // start version
        var highVersion = 0;
        var lowVersion = window.openDataCache().version;

        // -- LOW: add a.txt, b.txt, c.txt
        cache.transaction(function(tx) {
            tx.capture('files/a.txt');
            tx.capture('files/b.txt');
            tx.capture('files/c.txt');
            tx.commit();
        });

        // -- HIGH: remove b.txt
        setTimeout(function() {
            cache = window.openDataCache();
            cache.transaction(function(tx) {
                tx.release('files/b.txt');
                tx.commit();
            });

            // end version
            cache.swapCache();
            highVersion = window.openDataCache().version;
        });

        setTimeout(function() {
            var cache = window.openDataCache();
            cache.eachModificationSince(lowVersion, itemCallback1, successCallback1); // a, b, and c
            cache.eachModificationSince(null, itemCallback2, successCallback2);       // everything so far
        }, LATENCY);

        setTimeout(function() {
            ok(itemCb1 === 3, 'item callback 1 called ' + itemCb1 + ' times');
            ok(itemCb2 > 3, 'item callback 2 called ' + itemCb2 + ' times');
            ok(deletedCount === 1, 'delete count was 1');
            ok(calledSuccessCallback1, 'called the success callback');
            ok(calledSuccessCallback2, 'called the success callback');
            start();
        }, LATENCY*2);
    });
});


context('Local Server', function() {
    should('return dynamic intercepted representations', function() {
        stop(); expect(8);

        DataCache.Offline = true;

        var uri = 'blah.txt';
        var body = 'hello';
        var method = 'GET';
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, null, [method]);
        });

        var interceptorCalled = false;
        var reviewerCalled = false;
        var headerName = 'X-Test';
        var headerValue = 'Test';

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
            navigator.removeRegisteredOfflineHandlers();
            ok(interceptorCalled, 'called the interceptor');
            ok(!reviewerCalled, 'did not call the reviewer');
            start();
        }, LATENCY);
    });

    should('return dynamic reviewed representations', function() {
        stop(); expect(8);

        DataCache.Offline = false;

        var uri = 'data.txt';
        var body = 'Hello, World!';
        var method = 'GET';
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, null, [method]);
        });

        var interceptorCalled = false;
        var reviewerCalled = false;

        function verify() {
            if (xhr.readyState === 4) {
                ok(xhr.status === 200);
                ok(xhr.statusText === Http.Status[200]);
                ok(xhr.responseText === body);
            }
        }

        function interceptor(request, response) {
            interceptorCalled = true;
        }

        function reviewer(request, response) {
            reviewerCalled = true;
            ok(response.statusCode === 200);
            ok(response.statusMessage === 'HTTP/1.1 ' + Http.Status[200]);
            ok(response.bodyText === body);
        }

        navigator.registerOfflineHandler(uri, interceptor, reviewer);

        var xhr = new InterceptableXMLHttpRequest();
        xhr.open(method, uri);
        xhr.onreadystatechange = verify;
        xhr.send();

        setTimeout(function() {
            navigator.removeRegisteredOfflineHandlers();
            ok(!interceptorCalled, 'did not call the interceptor');
            ok(reviewerCalled, 'called the reviewer');
            start();
        }, LATENCY);
    });

    should('use the most specific interceptor', function() {
        stop(); expect(3);

        DataCache.Offline = true;
        var uri = 'foo/bar/baz.txt';
        var method = 'GET';
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, '-', null, [method]);
        });

        var verified = false;
        var badHandlerFired = false;
        var goodHandlerFired = false;

        function badHandler() { badHandlerFired = true; }
        function goodHandler(r,m) {
            goodHandlerFired = true;
            m.setStatus(200, '-');
            m.send();
        }

        function verify() {
            if (xhr.readyState === 4)
                verified = (xhr.status === 200);
        }

        navigator.registerOfflineHandler('', badHandler);
        navigator.registerOfflineHandler('foo', badHandler);
        navigator.registerOfflineHandler('foo/bar', goodHandler);

        var xhr = new InterceptableXMLHttpRequest();
        xhr.open(method, uri);
        xhr.onreadystatechange = verify;
        xhr.send();

        setTimeout(function() {
            navigator.removeRegisteredOfflineHandlers();
            ok(goodHandlerFired, 'good handler fired');
            ok(!badHandlerFired, 'bad handler was not fired');
            ok(verified, 'verified');
            start();
        });
    });
});


context('[*] LocalServer', function() {
    should('bypass with X-Bypass-DataCache header', function() {
        stop(); expect(5);

        DataCache.Offline = true;

        var uri = 'data.txt';
        var body = 'Hello, World!';
        var method = 'GET';
        var cache = window.openDataCache();
        cache.offlineTransaction(function(tx) {
            tx.capture(uri, body, null, [method]);
        });

        var interceptorCalled = false;
        var reviewerCalled = false;

        function verify() {
            if (xhr.readyState === 4) {
                ok(xhr.status === 200, 'proper data');
                ok(xhr.statusText === Http.Status[200], 'proper data');
                ok(xhr.responseText === body, 'proper data');
            }
        }

        function interceptor() { interceptorCalled = true; }
        function reviewer() { reviewerCalled = true; }
        navigator.registerOfflineHandler(uri, interceptor, reviewer);

        var xhr = new InterceptableXMLHttpRequest();
        xhr.open(method, uri);
        xhr.setRequestHeader('X-Bypass-DataCache', 'true');
        xhr.onreadystatechange = verify;
        xhr.send();

        setTimeout(function() {
            navigator.removeRegisteredOfflineHandlers();
            ok(!interceptorCalled, 'interceptor was not called');
            ok(!reviewerCalled, 'reviewer was not called');
            start();
        }, LATENCY);
    });
});


context('[*] Online Transaction with 4xx or 5xx error', function() {
    var uri = 'code.php?code=500';
    should('fire error event', function() {
        stop(); expect(1);

        var flags = {};
        basicEventChecker('error', flags, 'firedErrorEvent');

        var cache = window.openDataCache();
        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(flags.firedErrorEvent, "fired error event");
            start();
        }, LATENCY);
    });
});


context('[*] Online Transaction with 401', function() {
    var uri = 'code.php?code=401';
    var cache = window.openDataCache();

    should('make fire obsolete event and make obsolete', function() {
        stop(); expect(4);

        var flags = {};
        basicEventChecker('obsolete', flags, 'firedObsoleteEvent');

        cache.transaction(function(tx) {
            tx.capture(uri);
        });

        setTimeout(function() {
            ok(flags.firedObsoleteEvent, "fired obsolete event");
            ok(!!flags.firedObsoleteEventEvent.cache, 'fired event had a cache');
            ok(flags.firedObsoleteEventEvent.uri === null, 'fired event had no uri');
            ok(cache.group.status === DataCache.OBSOLETE, "group became obsolete");
            start();
        }, LATENCY);
    });
});
