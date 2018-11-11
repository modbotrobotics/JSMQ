import { Message } from './JSMQ.js'

const testDoubleA = 1234.56789;
const testDoubleB = -1234.56789;
const testIntA = 1234;
const testIntB = -1234;
const testIntC = 87654321;
const testIntD = -87654321;
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

  // test('add buffer', () => {
  //   message.addBuffer(testBufferA);
  //   message.addBuffer(testBufferB);

  //   expect(message.frames[0]).toBe(testBufferA);
  //   expect(message.frames[1]).toBe(testBufferB);
    
  //   expect(message.addBuffer(0)).toBe(testBufferA);
  //   expect(message.addBuffer(1)).toBe(testBufferB);
  // });

  test('add double', () => {
    message.addDouble(testDoubleA);
    message.addDouble(testDoubleB);

    expect(message.getDouble(0)).toBeCloseTo(testDoubleA);
    expect(message.getDouble(1)).toBeCloseTo(testDoubleB);
  });

  test('add 16 bit int', () => {
    message.addInt16(testIntA);
    message.addInt16(testIntB);
  
    expect(message.getInt16(0)).toEqual(testIntA);
    expect(message.getInt16(1)).toEqual(testIntB);
  });

  test('add 32 bit int', () => {
    message.addInt32(testIntC);
    message.addInt32(testIntD);
  
    expect(message.getInt32(0)).toEqual(testIntC);
    expect(message.getInt32(1)).toEqual(testIntD);
  });

  test('add 16 bit uint', () => {
    message.addInt16(testIntA);
  
    expect(message.getInt16(0)).toEqual(testIntA);
  });

  test('add 32 bit uint', () => {
    message.addInt32(testIntA);
    message.addInt32(testIntC);
  
    expect(message.getInt32(0)).toEqual(testIntA);
    expect(message.getInt32(1)).toEqual(testIntC);
  });

  test('add string', () => {
    message.addString(testStringA);
    message.addString(testStringB);

    expect(message.getString(0)).toMatch(testStringA);
    expect(message.getString(1)).toMatch(testStringB);
  });
});