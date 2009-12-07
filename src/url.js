/*
 * Simple URL Parsing, all that is needed for checking URL components
 * Date: Monday December 7, 2009
 * Joseph Pecoraro
 */

URL = {};

URL.parse = function(url) {

    // start:          ^
    // scheme:         (?:(\w+):(?:\/\/)?)?   1 = scheme?
    // authority:      ([^\/:]+)              2 = authority
    // port            (?::(\d+))?            3 = port?
    // optional rest   (?:
    //   path              (\/[^\?#]*)        4 = path?
    //   query             (?:\?([^#]*))?     5 = query?
    //   fragment          (?:#(.*))?         6 = fragment?
    //                 )?$
    //
    //                   scheme        authority  port          path        query      fragment
    //             ------------------  -------- ---------     ---------  ------------  --------
    //            /                  \/       \/         \   /         \/            \/        \
    var regex = /^(?:(\w+):(?:\/\/)?)?([^\/:]+)(?::(\d+))?(?:(\/[^\?#]*)(?:\?([^#]*))?(?:#(.*))?)?$/;

    // Available in ES5, but not previous implementations
    if (!String.prototype.trim) {
        String.prototype.trim = function() {
            return this.replace(/^\s+|\s+$/g, '');
        }
    }

    // Process the URL
    url = url.trim();
    var m = url.match(regex);

    // Bad URL, or unsupported
    if (!m)
        return null;

    // Sanitize the results
    return {
        scheme:    (m[1] ? m[1].toLowerCase() : null),
        authority: m[2].toLowerCase(),
        port:      (m[3] ? parseInt(m[3], 10) : null),
        path:      m[4] || '/',
        query:     m[5] || '',
        fragment:  m[6] || ''
    };

}
