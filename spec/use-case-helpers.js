// ------------------
//   Network Values
// ------------------

var LATENCY = 500;
var dataFileText = 'Hello, World!';
var dataFileURI = 'data.txt';


// --------------------------
//   Sequence of Operations
// --------------------------

var order = [];

function addToOrder(id, str) {
    order.push(id);
    console.log(id, str);
}

function checkOrder() {
    addToOrder(4, 'test end');
    console.log(order);
    for (var i=0, len=order.length; i<len; ++i)
        if (order[i] !== i)
            return false;
    return true;
}
