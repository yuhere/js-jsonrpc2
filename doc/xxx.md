> 历史稿，不是当前 API。当前用法以仓库根目录的 README.md 和 SKILL.md 为准。

请继续实现 JavaScript JSON.stringify 的 AsyncGenerator 流式序列化器。
兼容性目标：尽可能兼容原生 JSON.stringify，包括 replacer、space 等选项。
主要目标：兼顾内存、性能和实现复杂度。

函数签名： 
function stringifyStream(input: unknown, { 
    bufferSize: number = 1024 * 16, 
    space?: string | number,
    replacer?: (this: any, key: string, value: any) => any
}): AsyncGenerator<string, void, unknown>

+ 原始类型: 直接使用 JSON.stringify 进行处理。
  - string（字符串）
  - number（数字）
  - bigint（大整数）
  - boolean（布尔值）
  - undefined（未定义）
  - symbol（符号）
  - null（空值）
+ toJSON: 对 toJSON 进行递归处理
+ Generator/AsyncGenerator/Iterator: 对 next 遍历+递归处理
+ Promise: await +递归处理
+ Date 类型: 使用 toISOString
+ Buffer 类型: 使用 toString('hex')
+ Array 类型： 遍历+递归处理
+ Object 类型 Record<string, object>： 遍历+递归处理

请提供完整可运行的代码和测试用例，并说明与原生 JSON.stringify 的兼容性差异。

## 测试用例

### JSON.stringify 动作一致测试用例

1. JSON.stringify 的基本用例
``` 
JSON.stringify({}); // '{}'
JSON.stringify(true); // 'true'
JSON.stringify("foo"); // '"foo"'
JSON.stringify([1, "false", false]); // '[1,"false",false]'
JSON.stringify([NaN, null, Infinity]); // '[null,null,null]'
JSON.stringify({ x: 5 }); // '{"x":5}'

JSON.stringify(new Date(1906, 0, 2, 15, 4, 5));
// '"1906-01-02T15:04:05.000Z"'

JSON.stringify({ x: 5, y: 6 });
// '{"x":5,"y":6}'
JSON.stringify([new Number(3), new String("false"), new Boolean(false)]);
// '[3,"false",false]'

// 文字列がキーとなった配列要素は列挙可能ではなく、JSON では意味をなさない
const a = ["foo", "bar"];
a["baz"] = "quux"; // a: [ 0: 'foo', 1: 'bar', baz: 'quux' ]
JSON.stringify(a);
// '["foo","bar"]'

JSON.stringify({ x: [10, undefined, function () {}, Symbol("")] });
// '{"x":[10,null,null,null]}'

// 標準データ構造
JSON.stringify([
  new Set([1]),
  new Map([[1, 2]]),
  new WeakSet([{ a: 1 }]),
  new WeakMap([[{ a: 1 }, 2]]),
]);
// '[{},{},{},{}]'

// 型付き配列
JSON.stringify([new Int8Array([1]), new Int16Array([1]), new Int32Array([1])]);
// '[{"0":1},{"0":1},{"0":1}]'
JSON.stringify([
  new Uint8Array([1]),
  new Uint8ClampedArray([1]),
  new Uint16Array([1]),
  new Uint32Array([1]),
]);
// '[{"0":1},{"0":1},{"0":1},{"0":1}]'
JSON.stringify([new Float32Array([1]), new Float64Array([1])]);
// '[{"0":1},{"0":1}]'

// toJSON()
JSON.stringify({
  x: 5,
  y: 6,
  toJSON() {
    return this.x + this.y;
  },
});
// '11'

// シンボル:
JSON.stringify({ x: undefined, y: Object, z: Symbol("") });
// '{}'
JSON.stringify({ [Symbol("foo")]: "foo" });
// '{}'
JSON.stringify({ [Symbol.for("foo")]: "foo" }, [Symbol.for("foo")]);
// '{}'
JSON.stringify({ [Symbol.for("foo")]: "foo" }, (k, v) => {
  if (typeof k === "symbol") {
    return "a symbol";
  }
});
// undefined

// 列挙可能でないプロパティ:
JSON.stringify(
  Object.create(null, {
    x: { value: "x", enumerable: false },
    y: { value: "y", enumerable: true },
  }),
);
// '{"y":"y"}'

// BigInt の値は例外が発生
JSON.stringify({ x: 2n });
// TypeError: BigInt value can't be serialized in JSON
```

2. 使用 replacer

```
function replacer(key, value) {
  // プロパティをフィルターする
  if (typeof value === "string") {
    return undefined;
  }
  return value;
}

const foo = {
  foundation: "Mozilla",
  model: "box",
  week: 45,
  transport: "car",
  month: 7,
};
JSON.stringify(foo, replacer);
// '{"week":45,"month":7}'
```

```

function makeReplacer() {
  let isInitial = true;

  return (key, value) => {
    if (isInitial) {
      isInitial = false;
      return value;
    }
    if (key === "") {
      // (最初のオブジェクト以外の) 名前が "" であるプロパティをすべて取り除く
      return undefined;
    }
    return value;
  };
}

const replacer = makeReplacer();
console.log(JSON.stringify({ "": 1, b: 2 }, replacer)); // "{"b":2}"
```

```
const foo = {
  foundation: "Mozilla",
  model: "box",
  week: 45,
  transport: "car",
  month: 7,
};

JSON.stringify(foo, ["week", "month"]);
// '{"week":45,"month":7}', "week" と "month" プロパティだけが保持される
```


3. 使用 space 参数

```
console.log(JSON.stringify({ a: 2 }, null, " "));
/*
{
 "a": 2
}
*/
console.log(JSON.stringify({ a: 2 }, null, 2));
/*
{
  "a": 2
}
*/
```

```
console.log(JSON.stringify({ uno: 1, dos: 2 }, null, "\t"));
/*
{
	"uno": 1,
	"dos": 2
}
*/
```

4. toJSON

```
const obj = {
  data: "data",

  toJSON(key) {
    return key ? `Now I am a nested object under key '${key}'` : this;
  },
};

JSON.stringify(obj);
// '{"data":"data"}'

JSON.stringify({ obj });
// '{"obj":"Now I am a nested object under key 'obj'"}'

JSON.stringify([obj]);
// '["Now I am a nested object under key '0'"]'
```

5. TypeError: cyclic object value

```
const circularReference = {};
circularReference.myself = circularReference;

// 循環参照をシリアライズすると "TypeError: cyclic object value" が発生
JSON.stringify(circularReference);
```


### 增强功能的测试用例

+ Generator/AsyncGenerator/Iterator: 对 next 遍历+递归处理
+ Promise: await +递归处理
+ Date 类型: 使用 toISOString
+ Buffer 类型: 使用 toString('hex')

