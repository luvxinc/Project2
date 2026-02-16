# Anime.js 4.0 核心 API 参考

> **加载时机**: 需要使用 Anime.js 实现基础动画时

## 1. animate() — 核心函数

```javascript
import { animate } from 'animejs';

// 基础语法
animate(targets, properties, parameters);

// 示例
animate('.box', {
  translateX: 250,     // CSS transform
  rotate: '1turn',     // 旋转
  opacity: [0, 1],     // [from, to]
  duration: 1000,      // 毫秒
  ease: 'outExpo',     // 缓动
});
```

## 2. 目标 (Targets)

| 类型 | 示例 | 说明 |
|------|------|------|
| CSS 选择器 | `'.box'`, `'#id'`, `'div.cls'` | 最常用 |
| DOM 元素 | `document.querySelector('.box')` | 直接引用 |
| NodeList | `document.querySelectorAll('.box')` | 批量选择 |
| JS 对象 | `{ value: 0 }` | 动画化任意数值 |
| 数组 | `['.el1', element, { v: 0 }]` | 混合目标 |

## 3. 可动画属性

### CSS 属性
```javascript
animate('.el', {
  opacity: 0.5,
  width: '200px',
  height: '100px',
  backgroundColor: '#FF0000',
  borderRadius: '50%',
  padding: '20px',
});
```

### CSS Transform (最高性能)
```javascript
animate('.el', {
  translateX: 250,      // pixels (默认)
  translateY: '50%',    // 百分比
  rotate: '1turn',      // 旋转
  scale: 1.5,           // 缩放
  skewX: '15deg',       // 倾斜
});
```

### CSS 变量 (JS only)
```javascript
animate('.el', {
  '--custom-prop': 100,
});
```

### SVG 属性 (JS only)
```javascript
animate('circle', {
  cx: 100,
  cy: 100,
  r: 50,
  strokeDashoffset: [anime.setDashoffset, 0],
});
```

### HTML 属性 (JS only)
```javascript
animate('input[type="range"]', {
  value: [0, 100],
});
```

## 4. 值类型 (Tween Value Types)

```javascript
animate('.el', {
  // 数值 (自动加 px)
  translateX: 250,
  
  // 带单位
  rotate: '1turn',
  width: '50%',
  
  // From-To 数组
  opacity: [0, 1],       // 从 0 到 1
  translateX: [-100, 100], // 从 -100 到 100
  
  // 颜色
  color: '#FF0000',
  backgroundColor: 'rgb(255,0,0)',
  
  // 函数 (每个目标不同值)
  translateX: (el, i, total) => i * 50,
  delay: (el, i) => i * 100,
  
  // 相对值 (JS only)
  translateX: '+=100',  // 相对当前 +100
  rotate: '-=30deg',    // 相对当前 -30
});
```

## 5. Tween 参数

```javascript
animate('.el', {
  translateX: {
    to: 250,              // 目标值
    from: 0,              // 起始值
    delay: 200,           // 属性级延迟
    duration: 500,        // 属性级时长
    ease: 'outElastic',   // 属性级缓动
    composition: 'blend', // JS only: blend|replace|add
    modifier: v => Math.round(v), // JS only: 值修改器
  },
});
```

## 6. 关键帧 (Keyframes)

### 属性值关键帧
```javascript
animate('.el', {
  translateX: [
    { to: 100, duration: 500 },
    { to: 200, duration: 300 },
    { to: 0, duration: 800, ease: 'inOutQuad' },
  ],
});
```

### 基于百分比的关键帧 (JS only)
```javascript
animate('.el', {
  translateX: [
    { to: 100, at: '25%' },
    { to: 200, at: '50%' },
    { to: 0, at: '100%' },
  ],
  duration: 2000,
});
```

## 7. 播放控制参数

```javascript
animate('.el', {
  translateX: 250,
  
  // 播放设置
  delay: 500,           // 开始前延迟 (ms)
  duration: 1000,       // 持续时间 (ms), 默认 1000
  loop: true,           // true | false | 数字
  loopDelay: 200,       // 循环间延迟 (JS only)
  alternate: true,      // 交替方向
  reversed: false,      // 反向播放
  autoplay: true,       // 自动播放 (默认 true)
  frameRate: 60,        // 帧率 (JS only)
  playbackRate: 1,      // 播放速率 (0.5 = 半速)
});
```

## 8. 回调 (Callbacks)

```javascript
const anim = animate('.el', {
  translateX: 250,
  
  onBegin: (anim) => { },     // 首次开始 (JS only)
  onComplete: (anim) => { },  // 完成时
  onUpdate: (anim) => { },    // 每帧更新 (JS only)
  onLoop: (anim) => { },      // 每次循环 (JS only)
  onPause: (anim) => { },     // 暂停时 (JS only)
});

// Promise
anim.then(() => console.log('done'));
```

## 9. 实例方法

```javascript
const anim = animate('.el', { translateX: 250 });

anim.play();      // 播放
anim.pause();     // 暂停
anim.restart();   // 重新开始
anim.reverse();   // 反向
anim.alternate(); // 切换方向
anim.resume();    // 恢复
anim.complete();  // 立即完成
anim.cancel();    // 取消
anim.revert();    // 恢复到初始状态
anim.reset();     // 重置 (JS only)
anim.seek(500);   // 跳转到 500ms
anim.stretch(2000); // 拉伸到 2000ms 总时长 (JS only)
```

## 10. 缓动函数完整参考

### 内置缓动
```
// 基础
linear

// 经典 (每种有 in/out/inOut)
inQuad    outQuad    inOutQuad
inCubic   outCubic   inOutCubic
inQuart   outQuart   inOutQuart
inQuint   outQuint   inOutQuint
inSine    outSine    inOutSine
inExpo    outExpo    inOutExpo
inCirc    outCirc    inOutCirc
inBack    outBack    inOutBack
inElastic outElastic inOutElastic
inBounce  outBounce  inOutBounce
```

### 函数式缓动
```javascript
import { spring, eases } from 'animejs';

// 弹簧
spring({ stiffness: 200, damping: 10, mass: 1, velocity: 0 })

// 快捷弹簧
spring({ bounce: 0.7 })    // 0-1, 越高越弹

// 自定义缓动 (简写)
'in(3)'      // power 3 ease-in
'out(4)'     // power 4 ease-out
'inOut(2.5)' // power 2.5 ease-in-out
```
