import { Server, WebSocket } from 'mock-socket';
global.WebSocket = WebSocket;
window.WebSocket = WebSocket;

import { Dealer, Message } from '..'

// Global constants
const addressA = "ws://localhost:8080";
const addressB = "ws://fakeaddress:1234";
var testMessageA = new Message();
var testMessageB = new Message();
var testMessageC = new Message();

testMessageA.addString("This is a test string");
testMessageB.addFloat(1234.5678, 8);
testMessageC.addString("test_command");
testMessageC.addInt(-1, 2);
testMessageC.addInt(-12345678, 4);
testMessageC.addFloat(-1234.5678, 8);

/**
 * Helper function to recreate a ZeroMQ frame "message" with a MORE byte
 *
 * ZeroMQ frames are sent as individual messages over WebSocket.
 * A MORE byte is prepended to each message to indicate whether there are additional
 * frames coming over the wire of the same ZeroMQ message.
 */
const messageFrameFromBuffer = (buffer, more) => {
  let data = new Uint8Array(buffer.byteLength + 1);
  data[0] = more;
  data.set(new Uint8Array(buffer), 1);
  return data;
}


describe('dealer connection', () => {
  var dealer;
  var server;

  afterEach(() => {
    server.close();
  });
  beforeEach(() => {
    dealer = new Dealer();
    server = new Server(addressA);
    server.on('connection', socket => {});
  });

  test('dealer connection success', done => {   
    const ready = jest.fn( () => {
      const endpoint = expect.objectContaining({ address: addressA });
      expect(dealer.endpoints).toContainEqual(endpoint);
      done();
    });

    dealer.sendReady = ready;
    dealer.connect(addressA);
  });
  
  test('dealer connection failure', () => {
    const endpoint = expect.objectContaining({ address: addressB });
    const ready = jest.fn();

    dealer.sendReady = ready;
    dealer.connect(addressB);

    expect(dealer.endpoints).toContainEqual(endpoint);
    expect(ready).not.toHaveBeenCalled();
  });

  test('dealer disconnection success', done => {   
    const ready = jest.fn( () => {
      const endpoint = expect.objectContaining({ address: addressA });
      expect(dealer.endpoints).toContainEqual(endpoint);
      
      dealer.disconnect(addressA);
      expect(dealer.endpoints).not.toContainEqual(endpoint);
      done();
    });

    dealer.sendReady = ready;
    dealer.connect(addressA);
  });
  
  test('dealer disconnection failure', done => {   
    const ready = jest.fn( () => {
      const endpoint = expect.objectContaining({ address: addressA });
      expect(dealer.endpoints).toContainEqual(endpoint);
      
      expect( () => { dealer.disconnect(addressB) }).toThrowError('Failed to disconnect from address');
      expect(dealer.endpoints).toContainEqual(endpoint);
      done();
    });

    dealer.sendReady = ready;
    dealer.connect(addressA);
  });
  
});


describe('dealer send and receive', () => {
  var dealer;
  var server;
  var messageCount = 0;
  var testMessages = [testMessageA, testMessageB, testMessageC];
  var totalFrameCount = testMessages.map(message => {  // Total number of frames
    return message.getSize();
  }).reduce((sum, element) => { return sum + element }, 0);
  
  afterEach(() => {
    dealer.disconnect(addressA)
    server.close();
  });

  beforeEach(() => {
    messageCount = 0;

    dealer = new Dealer();
    server = new Server(addressA);
  });

  test('dealer sends requests', done => {
    const verifyTest = jest.fn(() => {
      // Expect server to have received the ZeroMQ messages
      //  split into one WebSocket message per ZeroMQ frame, with more bytes
      expect(serverOnMessage).toBeCalledTimes(totalFrameCount);

      expect(serverOnMessage).toHaveBeenNthCalledWith(1, messageFrameFromBuffer(testMessageA.getBuffer(0), 0));
      expect(serverOnMessage).toHaveBeenNthCalledWith(2, messageFrameFromBuffer(testMessageB.getBuffer(0), 0));
      expect(serverOnMessage).toHaveBeenNthCalledWith(3, messageFrameFromBuffer(testMessageC.getBuffer(0), 1));
      expect(serverOnMessage).toHaveBeenNthCalledWith(4, messageFrameFromBuffer(testMessageC.getBuffer(1), 1));
      expect(serverOnMessage).toHaveBeenNthCalledWith(5, messageFrameFromBuffer(testMessageC.getBuffer(2), 1));
      expect(serverOnMessage).toHaveBeenNthCalledWith(6, messageFrameFromBuffer(testMessageC.getBuffer(3), 0));
      done();
    });

    const serverOnMessage = jest.fn(message => {
      messageCount++;
      if (messageCount === totalFrameCount) {
        verifyTest();
      }
    });

    const ready = jest.fn(message => {
      dealer.send(testMessageA);
      dealer.send(testMessageB);
      dealer.send(testMessageC);
    });

    server.on('connection', socket => {
      socket.on('message', serverOnMessage);
    });
    
    dealer.sendReady = ready;
    dealer.connect(addressA);
  });

  test('dealer processes incoming messages', done => {
    const verifyTest = jest.fn(() => {
      expect(dealerOnMessage).toBeCalledTimes(testMessages.length);
      expect(dealerOnMessage.mock.calls[0][0].frames).toEqual(testMessageA.frames);
      expect(dealerOnMessage.mock.calls[1][0].frames).toEqual(testMessageB.frames);
      expect(dealerOnMessage.mock.calls[2][0].frames).toEqual(testMessageC.frames);
      done();
    });

    const dealerOnMessage = jest.fn(message => {
      messageCount++;

      if (messageCount === testMessages.length) {
        verifyTest();
      }
    });
    
    const ready = jest.fn(message => {
      dealer.send(testMessageA);
      dealer.send(testMessageB);
      dealer.send(testMessageC);
    });

    server.on('connection', socket => {
      socket.on('message', message => {
        socket.send(message); 
      });
    });
    
    dealer.sendReady = ready;
    dealer.onMessage = dealerOnMessage;
    dealer.connect(addressA);
  });

  test('dealer receives replies', done => {
    const dealerOnMessage = jest.fn(message => {
      messageCount++;

      if (messageCount === testMessages.length) {
        done();
      }
    });
    
    const ready = jest.fn(message => {
      expect.assertions(3);
      dealer.send(testMessageA);
      dealer.receive().then(response => {expect(response.frames).toEqual(testMessageA.frames)});
      dealer.send(testMessageB);
      dealer.receive().then(response => {expect(response.frames).toEqual(testMessageB.frames)});
      dealer.send(testMessageC);
      dealer.receive().then(response => {expect(response.frames).toEqual(testMessageC.frames)});
    });

    server.on('connection', socket => {
      socket.on('message', message => {
        socket.send(message); 
      });
    });
    
    dealer.sendReady = ready;
    dealer.onMessage = dealerOnMessage;
    dealer.connect(addressA);
  });
});