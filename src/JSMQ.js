// Endpoint
function Endpoint(address) {
  var ClosedState = 0;
  var ConnectingState = 1;
  var ActiveState = 2;

  var that = this;
  var incomingMessage = null;
  var reconnectTries = 0;
  var state = ClosedState;
  var webSocket = null;

  console.log("Connecting to \"" + address + "\"");
  open();

  /**
   * Open a WebSocket connection to the endpoint address
   */
  function open() {
    if (webSocket != null) {
      webSocket.onopen = null;
      webSocket.onclose = null;
      webSocket.onmessage = null;
    }

    outgoingArray = [];

    webSocket = new window.WebSocket(address, ["WSNetMQ"]);
    webSocket.binaryType = "arraybuffer";
    state = ConnectingState;

    webSocket.onopen = onOpen;
    webSocket.onclose = onClose;
    webSocket.onmessage = onMessage;

    reconnectTries++;
  }

  /**
   * Callback on WebSocket connection opened
   *
   * @param {*} event
   */
  function onOpen (e) {
    console.log("WebSocket connection to \"" + address + "\" established");
    reconnectTries = 0;

    state = ActiveState;
    if (that.activated != null) {
      that.activated(that);
    }
  };

  /**
   * Callback on WebSocket connection closed
   *
   * Attempts to reconnect, until the number of reconnect tries exceeds the reconnect try limit.
   *
   * @param {*} event
   */
  function onClose(e) {
    console.log("WebSocket connection to \"" + address + "\" closed");
    var stateBefore = state;
    state = ClosedState;

    if (stateBefore == ActiveState && that.deactivated != null) {
      that.deactivated(that);
    }

    if (reconnectTries > 10) {
      window.setTimeout(open, 2000);
    } else {
      open();
    }
  };

  /**
   * Callback on WebSocket message received
   *
   * Attempts to parse the received message.
   *
   * @param {*} event
   */
  function onMessage(event) {
    // Parse blobs
    if (event.data instanceof Blob) {
      var arrayBuffer;
      var fileReader = new FileReader();
      fileReader.onload = function () {
        processFrame(this.result);
      };
      fileReader.readAsArrayBuffer(event.data);

    // Parse arraybuffers
    } else if (event.data instanceof ArrayBuffer) {
      processFrame(event.data);
    } else {
      // Other message types are not supported and will be dropped
      console.log("Could not parse message -- unsupported message type");
    }
  };

  /**
   * Process a message frame
   *
   * @param {*} frame
   */
  function processFrame(frame) {
    var view = new Uint8Array(frame);
    var more = view[0];

    if (incomingMessage == null) {
      incomingMessage = new JSMQ.Message();
    }

    incomingMessage.addBuffer(view.subarray(1));

    // last message
    if (more == 0) {
      if (that.onMessage != null) {
        that.onMessage(that, incomingMessage);
      }

      incomingMessage = null;
    }
  }

  /**
   * TODO(aelsen)
   */
  this.activated = null;

  /**
   * TODO(aelsen)
   */
  this.deactivated = null;

  /**
   * TODO(aelsen)
   */
  this.onMessage = null;

  /**
   * TODO(aelsen)
   */
  this.getIsActive = function() {
    return state == ActiveState;
  };

  /**
   * Write message to wire
   *
   * @param {JSMQ.Message} message
   */
  this.write = function (message) {
    console.log("JSMQ Endpoint writing message", message);  // DEBUG
    var messageSize = message.getSize();

    console.log(" - message size:", messageSize);  // DEBUG

    for (var j = 0; j < messageSize; j++) {
      var frame = message.getBuffer(j);
      console.log(" - frame:", frame);  // DEBUG

      var data = new Uint8Array(frame.length + 1);
      data[0] = j == messageSize - 1 ? 0 : 1; // set the more byte

      data.set(frame, 1);

      webSocket.send(data);
    }
  };
}

/**
 * Load Balancer
 */
function LoadBalancer() {
  var that = this;
  var current = 0;
  var endpoints = [];
  var isActive = false;
  this.writeActivated = null;

  /**
   * Attach: add endpoint to list of endpoints
   * @param {*} endpoint
   */
  this.attach = function(endpoint) {
    endpoints.push(endpoint);

    if (!isActive) {
      isActive = true;

      if (that.writeActivated != null)
      that.writeActivated();
    }
  };

  /**
   * Terminate: remove endpoint from list of endpoints
   * @param {*} endpoint
   */
  this.terminated = function(endpoint) {
    var index = endpoints.indexOf(endpoint);

    if (current == endpoints.length - 1) {
      current = 0;
    }

    endpoints.splice(index, 1);
  };

  /**
   * Send message over current endpoint
   * @param {*} message
   */
  this.send = function (message) {
    if (endpoints.length == 0) {
      isActive = false;
      console.log("Failed to send message - no valid endpoints");
      return false;
    }

    console.log("JSMQ loadbalancer sending message (send())", message);  // DEBUG
    endpoints[current].write(message);
    current = (current + 1) % endpoints.length;

    return true;
  };

  /**
   * TODO(aelsen)
   */
  this.getHasOut = function () {
    if (inprogress) {
      return true;
    }

    return endpoints.length > 0;
  };
}

/**
 * ZWSSock
 * TODO(aelsen)
 * @param {*} xattachEndpoint
 * @param {*} xendpointTerminated
 * @param {*} xhasOut
 * @param {*} xsend
 * @param {*} xonMessage
 */
function ZWSSocket(xattachEndpoint, xendpointTerminated, xhasOut, xsend, xonMessage) {

  this.onMessage = null;
  this.sendReady = null;

  var endpoints = [];

  /**
   * TODO(aelsen)
   * @param {*} endpoint
   */
  function onEndpointActivated(endpoint) {
    xattachEndpoint(endpoint);
  }

  /**
   * TODO(aelsen)
   * @param {*} endpoint
   */
  function onEndpointDeactivated(endpoint) {
    xendpointTerminated(endpoint);
  }

  /**
   * TODO(aelsen)
   * @param {*} address
   */
  this.connect = function (address) {
    var endpoint = new Endpoint(address);
    endpoint.activated = onEndpointActivated;
    endpoint.deactivated = onEndpointDeactivated;
    endpoint.onMessage = xonMessage;
    endpoints.push(endpoint);
  };

  /**
   * TODO(aelsen)
   * @param {*} address
   */
  this.disconnect = function(address) {
    // TODO: implement disconnect
  };

  /**
   * TODO(aelsen)
   * @param {*} message
   */
  this.send = function (message) {
    return xsend(message);
  };

  /**
   * TODO(aelsen)
   */
  this.getHasOut = function() {
    return xhasOut();
  };
}

// JSMQ namespace
function JSMQ() {}


/**
 * JSMQ Dealer
 */
JSMQ.Dealer = function() {
  var lb = new LoadBalancer();
  var socket = new ZWSSocket(xattachEndpoint, xendpointTerminated, xhasOut, xsend, xonMessage);

  lb.writeActivated = function() {
    if (socket.sendReady != null) {
      socket.sendReady(socket);
    }
  };

  function xattachEndpoint(endpoint) {
    lb.attach(endpoint);
  }

  function xendpointTerminated(endpoint) {
    lb.terminated(endpoint);
  }

  function xhasOut() {
    return lb.getHasOut();
  }

  function xsend(message) {
    console.log("JSMQ Dealer sending message (xsend())", message);  // DEBUG
    return lb.send(message);
  }

  function xonMessage(endpoint, message) {
    if (socket.onMessage != null) {
      socket.onMessage(message);
    }
  }

  return socket;
}

/**
 * JSMQ Subscriber
 */
JSMQ.Subscriber = function () {
  var socket = new ZWSSocket(xattachEndpoint, xendpointTerminated, xhasOut, xsend, xonMessage);;

  var subscriptions = [];
  var endpoints = [];

  var isActive = false;

  /**
   * TODO(aelsen)
   * @param {*} subscription
   */
  socket.subscribe = function (subscription) {
    if (subscription instanceof Uint8Array) {
      // continue
    }
    else if (subscription instanceof ArrayBuffer) {
      subscription = new Uint8Array(subscription);
    } else {
      subscription = StringUtility.StringToUint8Array(String(subscription));
    }

    // TODO: check if the subscription already exist
    subscriptions.push(subscription)

    var message = createSubscriptionMessage(subscription, true);

    for (var i = 0; i < endpoints.length; i++) {
      endpoints[i].write(message);
    }
  }

  /**
   * TODO(aelsen)
   * @param {*} subscrption
   */
  socket.unsubscribe = function (subscription) {
    if (subscription instanceof Uint8Array) {
      // continue
    }
    else if (subscription instanceof ArrayBuffer) {
      subscription = new Uint8Array(subscription);

    } else {
      subscription = StringUtility.StringToUint8Array(String(subscription));
    }

    for (var j = 0; j < subscriptions.length; j++) {

      if (subscriptions[j].length == subscription.length) {
        var equal = true;

        for (var k = 0; k < subscriptions[j].length; k++) {
          if (subscriptions[j][k] != subscription[k]) {
            equal = false;
            break;
          }
        }

        if (equal) {
          subscriptions.splice(j, 1);
          break;
        }
      }
    }

    var message = createSubscriptionMessage(subscription, false);

    for (var i = 0; i < endpoints.length; i++) {
      endpoints[i].write(message);
    }
  }

  /**
   * TODO(aelsen)
   * @param {*} subscription
   * @param {*} subscribe
   */
  function createSubscriptionMessage(subscription, subscribe) {
    var frame = new Uint8Array(subscription.length + 1);
    frame[0] = subscribe ? 1 : 0;
    frame.set(subscription, 1);

    var message = new JSMQ.Message();
    message.addBuffer(frame);

    return message;
  }

  function xattachEndpoint(endpoint) {
    endpoints.push(endpoint);

    for (var i = 0; i < subscriptions.length; i++) {
      var message = createSubscriptionMessage(subscriptions[i], true);

      endpoint.write(message);
    }

    if (!isActive) {
      isActive = true;

      if (socket.sendReady != null) {
        socket.sendReady(socket);
      }
    }
  }

  function xendpointTerminated(endpoint) {
    var index = endpoints.indexOf(endpoint);
    endpoints.splice(index, 1);
  }

  function xhasOut() {
    return false;
  }

  function xsend(message, more) {
    throw new "Send not supported on sub socket";
  }

  function xonMessage(endpoint, message) {
    if (socket.onMessage != null) {
      socket.onMessage(message);
    }
  }

  return socket;
}

// JSMQ Message
JSMQ.Message = function () {
  this.frames = [];

  /**
   * Get size in number of frames
   */
  this.getSize = function() {
    return this.frames.length;
  }

  /**
   * Insert string at the beginning of the message
   * @param {*} str
   */
  this.prependString = function(str) {
    str = String(str);

    // one more byte is saved for the more byte
    var buffer = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, buffer);

    this.frames.splice(0, 0, buffer);
  }

  /**
   * Append a string to the end of the message
   * @param {*} str
   */
  this.addString = function(str) {
    str = String(str);

    // one more byte is saved for the more byte
    var buffer = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, buffer);
    this.frames.push(buffer);
  }

  /**
   * Pop the first frame of the message, as a string
   */
  this.popString = function() {
    var frame = this.popBuffer();

    return StringUtility.Uint8ArrayToString(frame);
  }

  /**
   * Pop the first frame of the message, as a buffer
   */
  this.popBuffer = function() {
    var frame = this.frames[0];
    this.frames.splice(0, 1);

    return frame;
  }

  /**
   * Append a buffer to the end of themessage
   * @param {*} buffer
   */
  this.addBuffer = function (buffer) {
    if (buffer instanceof ArrayBuffer) {
      this.frames.push(new Uint8Array(buffer));
    }
    else if (buffer instanceof Uint8Array) {
      this.frames.push(buffer);
    } else {
      throw new "unknown buffer type";
    }
  }

  /**
   * Get buffer at frame location
   * @param {*} i
   */
  this.getBuffer = function(i) {
    return this.frames[i];
  }
}


// String Utility
function StringUtility() {}

StringUtility.StringToUint8Array = function (str, buffer) {
  if (typeof buffer === 'undefined') {
    buffer = new Uint8Array(str.length);
  }

  for (var i = 0, strLen = str.length; i < strLen; i++) {
    var char = str.charCodeAt(i);

    if (char > 255) {
      // only ASCII are supported at the moment, we will put ? instead
      buffer[i] = "?".charCodeAt();
    } else {
      buffer[i] = char;
    }
  }

  return buffer;
}

StringUtility.Uint8ArrayToString = function(buffer) {
  return String.fromCharCode.apply(null, buffer);
}