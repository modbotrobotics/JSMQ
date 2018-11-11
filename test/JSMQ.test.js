import { Server, WebSocket } from 'mock-socket';
import { Dealer, Message } from '../src/JSMQ.js'

global.WebSocket = WebSocket;

beforeAll(() => {
    const fakeHost = '127.0.0.1:9876';
    const mockServer = new Server(fakeURL);

    const testDoubleA = 123.456;
    const testStringA = "test message string";

    var testMessageA = new Message();
    var testMessageB = new Message();

    testMessageA.addString(testStringA);
    testMessageB.addDouble(testDoubleA);

    mockServer.on('connection', socket => {
        socket.on('message', data => {
            console.log(data);
            socket.send('test message from mock server');
        });
    });
});


// Create Dealer
    // Expect Dealer to be ZWSSock

// Connect
    // Expect endpoint to be created
        // Expect websocket to be connected
    // Expect Dealer's Loadbalancer to have endpoint


test('message callback executed', done => {
    let dealer = new Dealer();
    dealer.connect("ws://127.0.0.1:15798");

    mockCallback = jest.fn(message => {
        done();
    });

    dealer.send(testMessageA);
    dealer.send(testMessageB);
    
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]).toBe(responseA);
    expect(mockCallback.mock.calls[1][0]).toBe(responseB);

});
    
// Bind onMessage
    // Check that onMessage has been bound
    // bound onMessage has been called

// Send message
    // Confirm message has been constructed
        // Confirm frames
        // Confirm more bytes
    
    // Confirm message has been sent (sent has been called)
