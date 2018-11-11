import { Message } from './JSMQ.js'

const testDoubleA = 1234.56789;
const testDoubleB = -1234.56789;
const testIntA = 1234;
const testIntB = -1234;
const testLongA = 123456789;
const testLongB = -123456789;
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

    expect(message.addDouble(0)).toBeCloseTo(testDoubleA);
    expect(message.addDouble(1)).toBeCloseTo(testDoubleB);
  });

  test('add int', () => {
    message.addInt(testIntA);
    message.addInt(testIntA);
  
    expect(message.getInt(0)).toEqual(testIntA);
    expect(message.getInt(1)).toEqual(testIntB);
  });

  test('add Long', () => {
    message.addLong(testLongA);
    message.addLong(testLongB);

    expect(message.getLong(0)).toEqual(testLongA);
    expect(message.getLong(1)).toEqual(testLongB);
  });

  test('add string', () => {
    message.addBuffer(testStringA);
    message.addBuffer(testStringB);

    expect(message.getString(0)).toMatch(testStringA);
    expect(message.getString(1)).toMatch(testStringB);
  });
});