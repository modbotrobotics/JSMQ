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

  test('add buffer', () => {
    message.addBuffer(testBufferA);
    message.addBuffer(testBufferB);

    expect(message.frames[0]).toBe(testBufferA);
    expect(message.frames[1]).toBe(testBufferB);
    
    expect(message.getBuffer(0)).toBe(testBufferA);
    expect(message.getBuffer(1)).toBe(testBufferB);
  });

  test('add double', () => {
    message.addDouble(testDoubleA);
    message.addDouble(testDoubleB);

    expect(message.getDouble(0)).toBeCloseTo(testDoubleA);
    expect(message.getDouble(1)).toBeCloseTo(testDoubleB);

    expect(message.popDouble()).toBeCloseTo(testDoubleA);
    expect(message.popDouble()).toBeCloseTo(testDoubleB);
  });

  test('add 16 bit int', () => {
    message.addInt16(testInt16Min);
    message.addInt16(testInt16Max);
  
    expect(message.getInt16(0)).toEqual(testInt16Min);
    expect(message.getInt16(1)).toEqual(testInt16Max);
  
    expect(message.popInt16()).toEqual(testInt16Min);
    expect(message.popInt16()).toEqual(testInt16Max);
  });

  test('add 32 bit int', () => {
    message.addInt32(testInt16Min);
    message.addInt32(testInt16Max);
    message.addInt32(testInt32Min);
    message.addInt32(testInt32Max);
    message.addInt32(testUint16Max);
  
    expect(message.getInt32(0)).toEqual(testInt16Min);
    expect(message.getInt32(1)).toEqual(testInt16Max);
    expect(message.getInt32(2)).toEqual(testInt32Min);
    expect(message.getInt32(3)).toEqual(testInt32Max);
  
    expect(message.popInt32()).toEqual(testInt16Min);
    expect(message.popInt32()).toEqual(testInt16Max);
    expect(message.popInt32()).toEqual(testInt32Min);
    expect(message.popInt32()).toEqual(testInt32Max);
  });

  test('add 16 bit uint', () => {
    message.addUint16(testInt16Max);
    message.addUint16(testUint16Max);
    
    expect(message.getUint16(0)).toEqual(testInt16Max);
    expect(message.getUint16(1)).toEqual(testUint16Max);

    expect(message.popUint16()).toEqual(testInt16Max);
    expect(message.popUint16()).toEqual(testUint16Max);
  });

  test('add 32 bit uint', () => {
    message.addUint32(testInt16Max);
    message.addUint32(testInt32Max);
    message.addUint32(testUint16Max);
    message.addUint32(testUint32Max);
  
    expect(message.getUint32(0)).toEqual(testInt16Max);
    expect(message.getUint32(1)).toEqual(testInt32Max);
    expect(message.getUint32(2)).toEqual(testUint16Max);
    expect(message.getUint32(3)).toEqual(testUint32Max);
  
    expect(message.popUint32()).toEqual(testInt16Max);
    expect(message.popUint32()).toEqual(testInt32Max);
    expect(message.popUint32()).toEqual(testUint16Max);
    expect(message.popUint32()).toEqual(testUint32Max);
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