import { Server, WebSocket } from 'mock-socket';
global.WebSocket = WebSocket;
window.WebSocket = WebSocket;

import { Dealer, Message } from './JSMQ.js'

// Global constants
const addressA = "ws://localhost:8080";
const addressB = "ws://fakeaddress:1234";
var testMessageA = new Message();
var testMessageB = new Message();
var testMessageC = new Message();


beforeAll(() => {
  testMessageA.addString("This is a test string");
  testMessageB.addDouble(1234.5678);
  testMessageC.addString("test_command");
  testMessageC.addInt(-1);
  testMessageC.addLong(-12345678);
  testMessageC.addDouble(-1234.5678);
});


describe('dealer connection', () => {
  const ready = jest.fn();
  var dealer;
  var server;

  afterEach(() => {
    server.close();
  });
  beforeEach(() => {
    dealer = new Dealer();
    dealer.sendReady = ready;
    server = new Server(addressA);
    server.on('connection', socket => {
      console.log("Connection!");
    });
  });


  test('dealer connection success', () => {        
    const endpoint = expect.objectContaining({ address: addressA });
    
    dealer.connect(addressA);
    setTimeout(() => {  
      expect(dealer.endpoints).toContainEqual(endpoint);
      expect(ready).toHaveBeenCalled();
    }, 100);
  });
  
  test('dealer connection failure', () => {
    const endpoint = expect.objectContaining({ address: addressB });

    dealer.connect(addressB);

    setTimeout(() => {  
      expect(dealer.endpoints).toContainEqual(endpoint);
      expect(ready).not.toHaveBeenCalled();
    }, 100);
  });
});


describe('dealer send and receive', () => {
  var dealer;
  var server;
  
  afterEach(() => {
    server.close();
  });

  beforeEach(() => {
    dealer = new Dealer();
    server = new Server(addressA);
  });

  test('dealer sends requests', () => {
    const serverOnMessage = jest.fn(message => { 
    });

    server.on('connection', socket => {
      socket.on('message', serverOnMessage);
    });
    
    const ready = jest.fn(message => {
      dealer.send(testMessageA);
      dealer.send(testMessageB);
      dealer.send(testMessageC);
    });
    
    dealer.sendReady = ready;
    dealer.connect(addressA);
    
    setTimeout(() => {
      expect(serverOnMessage).toHaveBeenCalledTimes(3);
      expect(serverOnMessage).toHaveBeenNthCalledWith(0, testMessageA);
      expect(serverOnMessage).toHaveBeenNthCalledWith(1, testMessageB);
      expect(serverOnMessage).toHaveBeenNthCalledWith(2, testMessageC);
    }, 100);
  });

  test('dealer receives replies', () => {
    const dealerOnMessage = jest.fn(message => {});
    const serverOnMessage = jest.fn(message => {
      socket.send(message.prependString("Received"));
    });

    server.on('connection', socket => {
      socket.on('message', serverOnMessage);
    });
    
    const ready = jest.fn(message => {
      dealer.send(testMessageA);
      dealer.send(testMessageB);
      dealer.send(testMessageC);
    });
    
    dealer.sendReady = ready;
    dealer.connect(addressA);
    
    setTimeout(() => {
      expect(serverOnMessage).toHaveBeenCalledTimes(3);
      expect(serverOnMessage).toHaveBeenNthCalledWith(0, testMessageA.prependString("Received"));
      expect(serverOnMessage).toHaveBeenNthCalledWith(1, testMessageB.prependString("Received"));
      expect(serverOnMessage).toHaveBeenNthCalledWith(2, testMessageC.prependString("Received"));
    }, 100);
  });
});