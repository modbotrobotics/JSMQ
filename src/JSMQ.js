/**
 * Class representing a WebSocket endpoint
 * @param {string} address - The endpoint address (ex: "ws://127.0.0.1:15798")
 */
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
   * On open, perform activated actions, set endpoint state to ActiveState.
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
   * On close, perform deactivated actions, set state to ClosedState.
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
   * Attempt to parse the received message.
   * Parse raw blobs to ArrayBuffer before parsing frames.
   *
   * @param {*} event - The message event
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

    // Parse ArrayBuffer
    } else if (event.data instanceof ArrayBuffer) {
      processFrame(event.data);

    // Other message types are not supported and will be dropped
    } else {
      console.log("Could not parse message -- unsupported message type");
    }
  };

  /**
   * Process a message frame, adding the data as an ArrayBuffer to its list of frames
   *
   * @param {ArrayBuffer} frame
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
   * TODO
   */
  this.activated = null;

  /**
   * TODO
   */
  this.deactivated = null;

  /**
   * TODO
   */
  this.onMessage = null;

  /**
   * TODO
   */
  this.getIsActive = function() {
    return state == ActiveState;
  };

  /**
   * Write message to wire
   *
   * Each frame is sent as a separate message over WebSocket.
   * The ZWSSock reconstructs the final message from the series of separate messages.
   * A MORE byte is prepended to each message to indicate whether there are additional
   * frames coming over the wire.
   *
   * @param {JSMQ.Message} message - Message to write to wire
   */
  this.write = function (message) {
    var messageSize = message.getSize();

    for (var j = 0; j < messageSize; j++) {
      var frame = message.getPackagedFrame(j);

      var data = new Uint8Array(frame.byteLength + 1);
      data[0] = j == messageSize - 1 ? 0 : 1; // set the MORE byte
      data.set(new Uint8Array(frame), 1);

      webSocket.send(data);
    }
  };
}

/**
 * Class acting as Load Balancer
 */
function LoadBalancer() {
  var that = this;
  var current = 0;
  var endpoints = [];
  var isActive = false;
  this.writeActivated = null;

  /**
   * Attach: add an endpoint to list of endpoints
   * @param {JSMQ.Endpoint} endpoint - The endpoint to attach to
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
   * Terminate: remove an endpoint from list of endpoints
   * @param {JSMQ.Endpoint} endpoint
   */
  this.terminated = function(endpoint) {
    var index = endpoints.indexOf(endpoint);

    if (current == endpoints.length - 1) {
      current = 0;
    }

    endpoints.splice(index, 1);
  };

  /**
   * Send message over current the endpoint
   * @param {JSMQ.Message} message - The message to send
   * @return {Boolean} - Success
   */
  this.send = function (message) {
    if (endpoints.length == 0) {
      isActive = false;
      console.log("Failed to send message - no valid endpoints");
      return false;
    }

    endpoints[current].write(message);
    current = (current + 1) % endpoints.length;

    return true;
  };

  /**
   * TODO
   */
  this.getHasOut = function () {
    if (inprogress) {
      return true;
    }

    return endpoints.length > 0;
  };
}

/**
 * ZWSSocket
 */
function ZWSSocket(xattachEndpoint, xendpointTerminated, xhasOut, xsend, xonMessage) {
  this.onMessage = null;
  this.sendReady = null;

  var endpoints = [];

  function onEndpointActivated(endpoint) {
    xattachEndpoint(endpoint);
  }

  function onEndpointDeactivated(endpoint) {
    xendpointTerminated(endpoint);
  }

  this.connect = function (address) {
    var endpoint = new Endpoint(address);
    endpoint.activated = onEndpointActivated;
    endpoint.deactivated = onEndpointDeactivated;
    endpoint.onMessage = xonMessage;
    endpoints.push(endpoint);
  };

  this.disconnect = function(address) {
    // UNIMPLEMENTED
    console.log("Failed to disconnect - disconnect UNIMPLEMENTED");
  };

  this.send = function (message) {
    return xsend(message);
  };

  this.getHasOut = function() {
    return xhasOut();
  };
}

// JSMQ namespace
function JSMQ() {}


/**
 * Class representing a ZeroMQ DEALER type socket
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
 * Class representing a ZeroMQ SUBSCRIBER type socket
 */
JSMQ.Subscriber = function () {
  var socket = new ZWSSocket(xattachEndpoint, xendpointTerminated, xhasOut, xsend, xonMessage);;

  var endpoints = [];
  var subscriptions = [];

  var isActive = false;

  /**
   * TODO
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

    // TODO: check if the subscription already exists
    subscriptions.push(subscription)

    var message = createSubscriptionMessage(subscription, true);

    for (var i = 0; i < endpoints.length; i++) {
      endpoints[i].write(message);
    }
  }

  /**
   * TODO
   * @param {*} subscription
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
   * TODO
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

/**
 * Class representing a ZeroMQ message
 */
JSMQ.Message = function () {
  this.frames = [];  // Array of ArrayBuffers. Each ArrayBuffer represents a frame.

  /**
   * Get size in number of frames
   * @return {number} - number of frames
   */
  this.getSize = function() {
    return this.frames.length;
  }

  /**
   * Append a buffer to the end of the message
   * @param {ArrayBuffer} buffer - Buffer of data to append
   */
  this.addBuffer = function (data) {
    if (data instanceof ArrayBuffer) {
      this.frames.push(data);

    } else if (data instanceof Uint8Array) {
      this.frames.push(data.buffer);

    } else {
      throw ("Failed to add buffer to message - unknown buffer type \"" + typeof buffer + "\"");
    }
  }

  /**
   * Append a double to the end of the message
   * @param {number} number - Double to append
   */
  this.addDouble = function (number) {
    this.addBuffer(NumberUtility.doubleToByteArray(number));
  }

  /**
   * Append an int to the end of the message
   * @param {number} number - Int to append
   */
  this.addInt16 = function (number) {
    this.addBuffer(NumberUtility.int16ToByteArray(number));
  }

  /**
   * Append an int to the end of the message
   * @param {number} number - Int to append
   */
  this.addInt32 = function (number) {
    this.addBuffer(NumberUtility.int32ToByteArray(number));
  }

  /**
   * Append a long int to the end of the message
   * @param {number} number - Uint16 to append
   */
  this.addUint16 = function (number) {
    this.addBuffer(NumberUtility.int16ToByteArray(number));
  }

  /**
   * Append a long int to the end of the message
   * @param {number} number - Uint32 to append
   */
  this.addUint32 = function (number) {
    this.addBuffer(NumberUtility.int32ToByteArray(number));
  }

  /**
   * Append a string to the end of the message
   * @param {string} str - String to append
   */
  this.addString = function(str) {
    str = String(str);

    // A byte is saved for the MORE byte
    var arr = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, arr);
    this.addBuffer(arr);
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame to retrieve
   * @return {ArrayBuffer} - Frame payload
   */
  this.getFrame = function(i) {
    // Remove the prepended MORE byte from the payload
    return this.frames[i].slice(1);
  }

  /**
   * Get the frame at the specified location
   * @param {number} i - Frame to retrieve
   * @return {ArrayBuffer} - Frame payload
   */
  this.getPackagedFrame = function(i) {
    return this.frames[i];
  }

  /**
   * Get a double at the specified frame location
   * @param {*} i
   */
  this.getDouble = function (i) {
    var buf = this.getFrame(i);

    return NumberUtility.byteArrayToDouble(buf);
  }

  /**
   * Get an int at the specified frame location
   * @param {*} i
   */
  this.getInt16 = function (i) {
    var buf = this.getFrame(i);

    return NumberUtility.byteArrayToInt16(buf);
  }

  /**
   * Get an int at the specified frame location
   * @param {*} i
   */
  this.getInt32 = function (i) {
    var buf = this.getFrame(i);

    return NumberUtility.byteArrayToInt32(buf);
  }

  /**
   * Get a long int at the specified frame location
   * @param {*} i
   */
  this.getUint16 = function (i) {
    var buf = this.getFrame(i);

    return NumberUtility.byteArrayToUint16(buf);
  }

  /**
   * Get a long int at the specified frame location
   * @param {*} i
   */
  this.getUint32 = function (i) {
    var buf = this.getFrame(i);

    return NumberUtility.byteArrayToUint32(buf);
  }

  /**
   * Get a string at the specified frame location
   * @param {*} i
   */
  this.getString = function (i) {
    var frame = this.getFrame(i);
    return StringUtility.Uint8ArrayToString(new Uint8Array(frame));
  }

  /**
   * Pop the first frame of the message, as an ArrayBuffer
   * @return {ArrayBuffer} - Frame payload
   */
  this.popFrame = function() {
    var frame = this.frames[0];
    this.frames.splice(0, 1);

    // Remove the prepended "message continued" byte from the payload
    return frame.slice(1);
  }

  /**
   * Pop the first frame of the message, as a double
   * @return {double}
   */
  this.popDouble = function() {
    var frame = this.popFrame();
    return NumberUtility.byteArrayToDouble(frame);
  }

  /**
   * Pop the first frame of the message, as an int
   * @return {number}
   */
  this.popInt16 = function() {
    var frame = this.popFrame();
    return NumberUtility.byteArrayToInt16(frame);
  }

  /**
   * Pop the first frame of the message, as an int
   * @return {number}
   */
  this.popInt32 = function() {
    var frame = this.popFrame();
    return NumberUtility.byteArrayToInt32(frame);
  }

  /**
   * Pop the first frame of the message, as a string
   * @return {string}
   */
  this.popString = function() {
    var frame = this.popFrame();
    return StringUtility.Uint8ArrayToString(new Uint8Array(frame));
  }

  /**
   * Pop the first frame of the message, as a long int
   * @return {number}
   */
  this.popUint16 = function() {
    var frame = this.popFrame();
    return NumberUtility.byteArrayToUint16(frame);
  }

  /**
   * Pop the first frame of the message, as a long int
   * @return {number}
   */
  this.popUint32 = function() {
    var frame = this.popFrame();
    return NumberUtility.byteArrayToUint32(frame);
  }

  /**
   * Insert a string at the beginning of the message
   * @param {string} str
   */
  this.prependString = function(str) {
    str = String(str);

    var arr = new Uint8Array(str.length);

    StringUtility.StringToUint8Array(str, arr);

    this.frames.splice(0, 0, arr.buffer);
  }
}

// Number Utility
function NumberUtility() {}

NumberUtility.littleEndian = true;

NumberUtility.byteArrayToDouble = function (arr) {
  view = new DataView(arr);
  return view.getFloat64(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToInt16 = function (arr) {
  view = new DataView(arr);
  return view.getInt16(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToInt32 = function (arr) {
  view = new DataView(arr);
  return view.getInt32(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToUint16 = function (arr) {
  view = new DataView(arr);
  return view.getUint16(0, NumberUtility.littleEndian);
}

NumberUtility.byteArrayToUint32 = function (arr) {
  view = new DataView(arr);
  return view.getUint32(0, NumberUtility.littleEndian);
}

NumberUtility.doubleToByteArray = function (num) {
  arr = new ArrayBuffer(64);
  view = new DataView(arr);
  view.setFloat64(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.int16ToByteArray = function (num) {
  arr = new ArrayBuffer(2);
  view = new DataView(arr);
  view.setInt16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.int32ToByteArray = function (num) {
  arr = new ArrayBuffer(4);
  view = new DataView(arr);
  view.setInt32(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.uInt16ToByteArray = function (num) {
  arr = new ArrayBuffer(2);
  view = new DataView(arr);
  view.setUint16(0, num, NumberUtility.littleEndian);
  return arr;
}

NumberUtility.uInt32ToByteArray = function (num) {
  arr = new ArrayBuffer(4);
  view = new DataView(arr);
  view.setUint32(0, num, NumberUtility.littleEndian);
  return arr;
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
      // Only ASCII are supported at the moment, a '?' is used instead of unsupported chars
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