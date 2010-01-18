/*
 * Script to Approximate Storage Limitations to within 1kb.
 * Joseph Pecoraro
 *
 * Strategy:
 *   Fill up keys, with 0.25mb of data until hit the
 *   constraint. At that point, try 1kb of data at a
 *   time until we hit the constaint.
 *
 * Results: (1/18/2010)
 *   Safari  ~ 2.5mb
 *   Chrome  ~ 2.5mb
 *   Firefox ~ 5.0mb
 */

(function() {

    var str = '12345678'; // 8
    str += str;           // 16
    str += str;           // 32
    str += str;           // 64
    str += str;           // 128
    str += str;           // 256
    str += str;           // 512
    var kb = str += str;  // 1024 (1kb)
    str += str;           // 2048 (2kb)
    str += str;           // 4096 (4kb)
    str += str;           // .... (8kb)
    str += str;           // .... (16kb)
    str += str;           // .... (32kb)
    str += str;           // .... (64kb)
    str += str;           // .... (128kb)
    str += str;           // .... (256kb) (0.25mb)

    var size = 0;
    var good = true;
    var prefix = 'key-';
    var len = str.length;
    var kblen = kb.length;

    localStorage.clear();

    for (var i=0; good; ++i) {
        var key = prefix+i;
        try { localStorage.setItem(key, str); size += len; }
        catch (e) {
            var str2 = kb;
            while (good) {
                try {
                    localStorage.setItem(key, str2);
                    size += kblen;
                    str2 += kb;
                } catch (e) {
                    console.log('hit constraint', size, (size/1024/1024)+'mb');
                    good = false;
                }
            }
        }
    }

    localStorage.clear();

})();
