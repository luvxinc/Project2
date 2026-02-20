# Anime.js 4.0 高级模式参考

> **加载时机**: 需要 Timeline/React 集成/Stagger/SVG/Draggable/Scroll 动画时

## 1. Timeline (时间线)

### 基础
```javascript
import { timeline } from 'animejs';

// 创建时间线
const tl = timeline({
  duration: 500,        // 子动画默认时长
  ease: 'outExpo',      // 子动画默认缓动
  loop: true,           // 循环
  alternate: true,      // 交替
  autoplay: false,      // 不自动播放
});
```

### 添加动画
```javascript
tl.add('.el1', { translateX: 250 })                    // 前一个结束后开始
  .add('.el2', { translateY: 100 }, '+=200')           // 前一个结束后 +200ms
  .add('.el3', { rotate: '1turn' }, '-=100')           // 前一个结束前 100ms
  .add('.el4', { scale: 1.5 }, 500)                    // 绝对时间 500ms 处
  .add('.el5', { opacity: 0 }, '<<')                   // 与前一个同时开始
  .add('.el6', { translateX: -250 }, '<<+=300');        // 前一个开始后 300ms
```

### 时间偏移速查

| 语法 | 含义 | 示例 |
|------|------|------|
| (无) | 前一个结束后 | 默认顺序 |
| `'+=200'` | 前一个结束 + 200ms | 间隔 |
| `'-=100'` | 前一个结束 - 100ms | 重叠 |
| `500` | 绝对 500ms 处 | 精确定位 |
| `'<<'` | 与前一个**同时开始** | 并行 |
| `'<<+=300'` | 前一个开始 + 300ms | 延迟并行 |

### Timeline 方法 (继承 Timer)
```javascript
tl.play();
tl.pause();
tl.restart();
tl.reverse();
tl.seek(1000);
tl.stretch(5000); // JS only: 拉伸总时长
tl.add(el, props, offset); // 追加
tl.set(el, props, offset); // JS only: 立即设置
tl.refresh(); // JS only: 重新计算
```

## 2. createScope — React 集成 (关键!)

> **⚠️ React 中必须使用 createScope, 否则动画无法正确清理!**

### 标准 React 模式
```jsx
import { animate, createScope, spring, stagger } from 'animejs';
import { useEffect, useRef } from 'react';

function AnimatedComponent() {
  const root = useRef(null);
  const scope = useRef(null);

  useEffect(() => {
    // 创建 scope, 绑定到 root DOM
    scope.current = createScope({ root }).add(self => {
      // ✅ 此闭包内所有 animate() 自动 scoped 到 root
      
      animate('.card', {
        translateY: [-20, 0],
        opacity: [0, 1],
        delay: stagger(100),
        ease: 'outExpo',
      });

      // 注册外部可调用的方法
      self.add('shake', () => {
        animate('.card', {
          translateX: [
            { to: -10, duration: 50 },
            { to: 10, duration: 50 },
            { to: 0, duration: 100 },
          ],
        });
      });
    });

    // ✅ 清理: revert() 会取消所有 scoped 动画
    return () => scope.current.revert();
  }, []);

  const handleShake = () => {
    // 从外部调用 scope 内注册的方法
    scope.current.methods.shake();
  };

  return (
    <div ref={root}>
      <div className="card" onClick={handleShake}>Click me</div>
    </div>
  );
}
```

### createScope API
```javascript
const scope = createScope({ root: rootRef });

// 添加动画 scope
scope.add(self => {
  // self.add(name, fn) — 注册可外调方法
  // animate/timeline 在此闭包内自动 scoped
});

// 外部调用
scope.methods.myMethod(args);

// 清理 (componentWillUnmount)
scope.revert();  // 取消所有 scoped 动画并恢复 DOM
```

## 3. stagger() — 交错动画

### 基础交错
```javascript
import { animate, stagger } from 'animejs';

// 时间交错 (每个目标延迟 100ms)
animate('.items', {
  translateY: -40,
  opacity: [0, 1],
  delay: stagger(100),
});

// 值交错 (每个目标不同值)
animate('.items', {
  translateX: stagger(50),         // 0, 50, 100, 150...
  rotate: stagger([0, 360]),       // 范围: 0 到 360 均分
});
```

### stagger 参数
```javascript
stagger(value, {
  start: 500,           // 起始偏移
  from: 'center',       // center | last | first | index
  reversed: false,      // 反向
  ease: 'easeInOutQuad', // 缓动
  grid: [14, 5],        // 网格模式 [columns, rows]
  axis: 'x',            // 网格轴: 'x' | 'y'
  modifier: v => -v,    // 值修改器
});
```

### 常用交错模式
```javascript
// 从中心向外扩散
delay: stagger(50, { from: 'center' })

// 网格波纹 (14列 x 5行)
delay: stagger(50, { grid: [14, 5], from: 'center' })

// 反向交错 + 自定义缓动
delay: stagger(100, { reversed: true, ease: 'outQuad' })

// Timeline 中的位置交错
tl.add('.items', { opacity: 1 }, stagger(100))
```

## 4. SVG 动画

### 路径描边
```javascript
import { animate, svg } from 'animejs';

// SVG 描边动画
animate('path', {
  strokeDashoffset: [svg.setDashoffset, 0],
  duration: 2000,
  ease: 'inOutSine',
});
```

### 沿路径运动 (JS only)
```javascript
import { svg } from 'animejs';

const path = svg.createMotionPath('path#route');

animate('.element', {
  translateX: path('x'),
  translateY: path('y'),
  rotate: path('angle'),
  duration: 3000,
  ease: 'linear',
});
```

### 形状变形 (morphing) (JS only)
```javascript
import { svg } from 'animejs';

animate('path#shape', {
  d: svg.morphTo('path#target'),
  duration: 1500,
  ease: 'inOutQuad',
});
```

## 5. createDraggable — 拖拽

```javascript
import { createDraggable, spring } from 'animejs';

const draggable = createDraggable('.element', {
  // 约束
  container: '.boundary',          // DOM 容器
  // 或精确像素: [top, right, bottom, left]
  container: [0, 0, 0, 0],        // 限制在原位
  
  // 释放弹簧
  releaseEase: spring({ bounce: 0.7 }),
  
  // 轴约束
  axis: 'x',                       // 'x' | 'y'
  
  // 回调
  onGrab: (draggable) => { },
  onDrag: (draggable) => { },
  onRelease: (draggable) => { },
  onSettle: (draggable) => { },
});

// 方法
draggable.disable();
draggable.enable();
```

## 6. createScope + createDraggable (React 完整模式)

```jsx
useEffect(() => {
  scope.current = createScope({ root }).add(self => {
    // 动画 + 拖拽在同一个 scope
    animate('.logo', {
      scale: [{ to: 1.25, ease: 'inOut(3)', duration: 200 },
              { to: 1, ease: spring({ bounce: .7 }) }],
      loop: true,
      loopDelay: 250,
    });

    createDraggable('.logo', {
      container: [0, 0, 0, 0],
      releaseEase: spring({ bounce: .7 }),
    });

    self.add('rotateLogo', (n) => {
      animate('.logo', { rotate: n * 360, ease: 'out(4)', duration: 1500 });
    });
  });
  return () => scope.current.revert();
}, []);
```

## 7. Scroll 动画 (JS only)

```javascript
import { animate, scroll } from 'animejs';

// 滚动驱动动画
scroll({
  targets: '.progress-bar',
  // 动画参数
  scaleX: [0, 1],
  // 滚动配置
  container: window,             // 滚动容器
  target: '.section',            // 触发元素
  enter: 'top bottom',           // 进入: "[target] [container]"
  leave: 'bottom top',           // 离开
});
```

## 8. Timer (基础定时器)

```javascript
import { timer } from 'animejs';

// 不绑定 DOM, 纯时间控制
const t = timer({
  duration: 1000,
  loop: 3,
  onUpdate: (timer) => {
    console.log(timer.progress); // 0-1
    console.log(timer.currentTime); // ms
  },
  onComplete: () => { },
});

t.play();
t.pause();
t.seek(500);
```

## 9. 企业级 React 最佳实践

### 进入动画组件
```jsx
function FadeInList({ items }) {
  const root = useRef(null);
  const scope = useRef(null);

  useEffect(() => {
    scope.current = createScope({ root }).add(() => {
      animate('.list-item', {
        translateY: [20, 0],
        opacity: [0, 1],
        delay: stagger(80, { ease: 'outQuad' }),
        duration: 600,
        ease: 'outExpo',
      });
    });
    return () => scope.current.revert();
  }, [items]); // 数据变化时重新触发

  return (
    <ul ref={root}>
      {items.map(item => (
        <li key={item.id} className="list-item">{item.name}</li>
      ))}
    </ul>
  );
}
```

### 页面过渡
```jsx
function PageTransition({ children, routeKey }) {
  const root = useRef(null);
  const scope = useRef(null);

  useEffect(() => {
    scope.current = createScope({ root }).add(() => {
      animate('[data-animate]', {
        translateY: [30, 0],
        opacity: [0, 1],
        delay: stagger(60),
        duration: 800,
        ease: 'outExpo',
      });
    });
    return () => scope.current.revert();
  }, [routeKey]);

  return <div ref={root}>{children}</div>;
}
```
