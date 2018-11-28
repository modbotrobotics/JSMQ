import { Message } from '..'

const testDoubleA = 1234.56789;
const testDoubleB = -1234.56789;
const testInt16Max = 32767;
const testInt16Min = -32768;
const testInt32Max = 2147483647;
const testInt32Min = -2147483648;
const testUint16Max = 65535;
const testUint32Max = 4294967295;
const testStringA = "test_string_a";
const testStringB = "";
var testBufferA = new ArrayBuffer(2);
var testBufferB = new ArrayBuffer(64);

describe('message creation', () => {
  var message;
  
  afterEach(() => {
  });

  beforeEach(() => {
    message = new Message();
  });

  test('add boolean', () => {
    message.addBoolean(true);
    message.addBoolean(false);
    
    expect(message.getBoolean(0)).toBeTruthy();
    expect(message.getBoolean(1)).toBeFalsy();

    expect(message.popBoolean()).toBeTruthy();
    expect(message.popBoolean()).toBeFalsy();
  });

  test('add buffer', () => {
    message.addBuffer(testBufferA);
    message.addBuffer(testBufferB);

    expect(message.frames[0]).toBe(testBufferA);
    expect(message.frames[1]).toBe(testBufferB);
    
    expect(message.getBuffer(0)).toBe(testBufferA);
    expect(message.getBuffer(1)).toBe(testBufferB);
  });

  test('add double', () => {
    message.addFloat(testDoubleA);
    message.addFloat(testDoubleB);

    expect(message.getFloat(0)).toBeCloseTo(testDoubleA);
    expect(message.getFloat(1)).toBeCloseTo(testDoubleB);

    expect(message.popFloat()).toBeCloseTo(testDoubleA);
    expect(message.popFloat()).toBeCloseTo(testDoubleB);
  });

  test('add 16 bit int', () => {
    message.addInt(testInt16Min, 2);
    message.addInt(testInt16Max, 2);
  
    expect(message.getInt(0, 2)).toEqual(testInt16Min);
    expect(message.getInt(1, 2)).toEqual(testInt16Max);
  
    expect(message.popInt(2)).toEqual(testInt16Min);
    expect(message.popInt(2)).toEqual(testInt16Max);
  });

  test('add 32 bit int', () => {
    message.addInt(testInt16Min);
    message.addInt(testInt16Max);
    message.addInt(testInt32Min);
    message.addInt(testInt32Max);
    message.addInt(testUint16Max);
  
    expect(message.getInt(0)).toEqual(testInt16Min);
    expect(message.getInt(1)).toEqual(testInt16Max);
    expect(message.getInt(2)).toEqual(testInt32Min);
    expect(message.getInt(3)).toEqual(testInt32Max);
  
    expect(message.popInt()).toEqual(testInt16Min);
    expect(message.popInt()).toEqual(testInt16Max);
    expect(message.popInt()).toEqual(testInt32Min);
    expect(message.popInt()).toEqual(testInt32Max);
  });

  test('add 16 bit uint', () => {
    message.addUint(testInt16Max, 2);
    message.addUint(testUint16Max, 2);
    
    expect(message.getUint(0, 2)).toEqual(testInt16Max);
    expect(message.getUint(1, 2)).toEqual(testUint16Max);

    expect(message.popUint(2)).toEqual(testInt16Max);
    expect(message.popUint(2)).toEqual(testUint16Max);
  });

  test('add 32 bit uint', () => {
    message.addUint(testInt16Max);
    message.addUint(testInt32Max);
    message.addUint(testUint16Max);
    message.addUint(testUint32Max);
  
    expect(message.getUint(0)).toEqual(testInt16Max);
    expect(message.getUint(1)).toEqual(testInt32Max);
    expect(message.getUint(2)).toEqual(testUint16Max);
    expect(message.getUint(3)).toEqual(testUint32Max);
  
    expect(message.popUint()).toEqual(testInt16Max);
    expect(message.popUint()).toEqual(testInt32Max);
    expect(message.popUint()).toEqual(testUint16Max);
    expect(message.popUint()).toEqual(testUint32Max);
  });

  test('add string', () => {
    message.addString(testStringA);
    message.addString(testStringB);

    expect(message.getString(0)).toMatch(testStringA);
    expect(message.getString(1)).toMatch(testStringB);

    expect(message.popString()).toMatch(testStringA);
    expect(message.popString()).toMatch(testStringB);
  });
});
