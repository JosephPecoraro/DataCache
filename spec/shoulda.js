// nobody said it had to be tough!
var should = test;

// sugar up modules
var context = function(msg, fn) {
    module(msg);
    fn.call(arguments);
};

// perform some cleanup to make the output module emulator/screen friendly
QUnit.done = function(){
    var tests = document.getElementById('qunit-tests').childNodes;
    var l = tests.length;
    for (var i = 0; i<l; i++) {
        var n = tests[i];
        // replace with mobdule with should
        n.firstChild.textContent = n.firstChild.textContent.replace(/module:/, 'should');

        // OPTIONAL: kill the funk, leave the clean
        // n.innerHTML = n.firstChild.textContent.replace(/\(\d+, \d+, \d+\)/g, '');
    };
};
