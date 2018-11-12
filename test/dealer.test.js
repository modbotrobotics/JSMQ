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


beforeAll(() => {
  testMessageA.addString("This is a test string");
  testMessageB.addFloat(1234.5678, 8);
  testMessageC.addString("test_command");
  testMessageC.addInt(-1, 2);
  testMessageC.addInt(-12345678, 4);
  testMessageC.addFloat(-1234.5678, 8);
});


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

    setTimeout(() => {  
    }, 100);
  });
  
  test('dealer connection failure', () => {
    const endpoint = expect.objectContaining({ address: addressB });
    const ready = jest.fn();

    dealer.sendReady = ready;
    dealer.connect(addressB);

    expect(dealer.endpoints).toContainEqual(endpoint);
    expect(ready).not.toHaveBeenCalled();
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
      expect(dealerOnMessage).toHaveBeenCalledTimes(3);
      expect(dealerOnMessage).toHaveBeenNthCalledWith(0, testMessageA.prependString("Received"));
      expect(dealerOnMessage).toHaveBeenNthCalledWith(1, testMessageB.prependString("Received"));
      expect(dealerOnMessage).toHaveBeenNthCalledWith(2, testMessageC.prependString("Received"));
    }, 100);
  });
});