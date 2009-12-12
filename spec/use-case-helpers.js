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
    addToOrder(order[order.length-1]+1, 'test end');
    console.log('resulting order', order);
    for (var i=0, len=order.length; i<len; ++i)
        if (order[i] !== i)
            return false;
    return true;
}
