---
name: Anime.js 4.0 Animation Library
description: Complete reference for Anime.js 4.0 - a lightweight JavaScript animation engine for CSS, SVG, DOM, and JavaScript objects
---

# Anime.js 4.0 Skill

## Overview

Anime.js is a lightweight JavaScript animation library with a simple, powerful API. It works with CSS properties, SVG, DOM attributes, and JavaScript Objects.

**Version**: 4.x (current)
**Package**: `animejs`
**Size**: ~17KB minified
**GitHub**: https://github.com/juliangarnier/anime

## Installation

```bash
# npm
npm install animejs

# pnpm
pnpm add animejs
```

## Core Imports

```typescript
import { 
  animate,           // Main animation function
  stagger,           // Stagger delays
  createScope,       // Scope for React/cleanup
  svg,               // SVG utilities
  spring,            // Spring easing
  createDraggable,   // Drag interaction
  createTimeline,    // Timeline sequencing
  utils              // Utility functions
} from 'animejs';
```

---

## 1. Basic Animation

### Simple Property Animation

```typescript
animate('.element', {
  translateX: 250,
  rotate: '1turn',
  duration: 800,
  ease: 'inOutQuad'
});
```

### Multiple Properties

```typescript
animate('.box', {
  translateX: 250,
  scale: 2,
  rotate: '1turn',
  backgroundColor: '#FFF',
  borderRadius: ['0%', '50%'],
  duration: 2000,
});
```

### From-To Values

```typescript
animate('.element', {
  translateX: [0, 250],      // From 0 to 250
  opacity: [0, 1],           // Fade in
  scale: [0.5, 1],           // Scale up
});
```

---

## 2. Stagger Animation

Stagger creates cascading delays for multiple elements.

### Basic Stagger

```typescript
animate('.item', {
  translateY: [50, 0],
  opacity: [0, 1],
  delay: stagger(100),        // 100ms between each
  duration: 600,
});
```

### Stagger with Start Delay

```typescript
animate('.card', {
  scale: [0.9, 1],
  opacity: [0, 1],
  delay: stagger(100, { start: 500 }),  // Start after 500ms
});
```

### Grid Stagger

```typescript
animate('.grid-item', {
  scale: [0, 1],
  delay: stagger(50, {
    grid: [14, 5],            // 14 columns, 5 rows
    from: 'center',           // Animate from center
  }),
});
```

### Stagger Options

```typescript
stagger(value, {
  start: 0,           // Initial delay
  from: 'first',      // 'first', 'last', 'center', number
  grid: [cols, rows], // Grid layout
  direction: 'normal' // 'normal', 'reverse'
});
```

---

## 3. Playback Settings

```typescript
animate('.element', {
  translateX: 250,
  
  // Timing
  duration: 1000,       // Animation duration (ms)
  delay: 500,           // Start delay (ms)
  
  // Looping
  loop: true,           // Infinite loop
  loop: 3,              // Loop 3 times
  loopDelay: 1000,      // Delay between loops
  
  // Direction
  alternate: true,      // Reverse on each loop
  reversed: true,       // Start reversed
  
  // Playback
  autoplay: true,       // Auto start (default)
  frameRate: 60,        // Target FPS
  playbackRate: 1,      // Speed multiplier
});
```

---

## 4. Easing Functions

### Built-in Easings

```typescript
ease: 'linear'
ease: 'in(power)'      // in(2), in(3), in(4)
ease: 'out(power)'     // out(2), out(3), out(4)
ease: 'inOut(power)'   // inOut(2), inOut(3)
ease: 'outIn(power)'
ease: 'inOutQuad'      // Preset shortcuts
ease: 'outExpo'
ease: 'inOutBack'
```

### Spring Easing

```typescript
import { spring } from 'animejs';

animate('.element', {
  translateX: 250,
  ease: spring({ 
    mass: 1,
    stiffness: 100,
    damping: 10,
    bounce: 0.5 
  }),
});
```

---

## 5. Callbacks

```typescript
animate('.element', {
  translateX: 250,
  
  onBegin: (anim) => {
    console.log('Animation started');
  },
  
  onUpdate: (anim) => {
    console.log(`Progress: ${anim.progress}%`);
  },
  
  onComplete: (anim) => {
    console.log('Animation finished');
  },
  
  onLoop: (anim) => {
    console.log('Loop completed');
  },
  
  onPause: (anim) => {
    console.log('Animation paused');
  },
}).then(() => {
  console.log('Promise resolved');
});
```

---

## 6. Animation Controls

```typescript
const anim = animate('.element', {
  translateX: 250,
  autoplay: false,        // Don't auto-start
});

// Control methods
anim.play();              // Start/resume
anim.pause();             // Pause
anim.restart();           // Restart from beginning
anim.reverse();           // Reverse direction
anim.alternate();         // Toggle direction
anim.resume();            // Resume after pause
anim.complete();          // Jump to end
anim.reset();             // Reset to initial state
anim.cancel();            // Cancel and reset
anim.revert();            // Revert all changes
anim.seek(500);           // Seek to 500ms
anim.seek('50%');         // Seek to 50%
anim.stretch(2000);       // Change duration
```

---

## 7. SVG Animations

### createDrawable - Line Drawing

```typescript
import { animate, svg, stagger } from 'animejs';

// Create drawable paths
const drawables = svg.createDrawable('.line');

// Animate line drawing
animate(drawables, {
  draw: ['0 0', '0 1', '1 1'],  // Hidden → Draw → Erase
  ease: 'inOutQuad',
  duration: 2500,
  delay: stagger(150),
  loop: true,
  loopDelay: 1000,
});
```

### Draw Values

```
draw: '0 1'     // Full line visible
draw: '0 0.5'   // First half visible
draw: '0.5 1'   // Second half visible
draw: '1 1'     // Hidden (end)
```

### morphTo - Shape Morphing

```typescript
import { svg } from 'animejs';

animate('.shape', {
  d: svg.morphTo('.target-shape'),
  duration: 1000,
});
```

### createMotionPath - Path Following

```typescript
import { svg } from 'animejs';

const motionPath = svg.createMotionPath('.path');

animate('.element', {
  ...motionPath,
  duration: 3000,
  loop: true,
});
```

---

## 8. React Integration

### Using createScope

```tsx
import { useEffect, useRef } from 'react';
import { animate, createScope, spring } from 'animejs';

function AnimatedComponent() {
  const root = useRef<HTMLDivElement>(null);
  const scope = useRef<ReturnType<typeof createScope> | null>(null);

  useEffect(() => {
    scope.current = createScope({ root }).add(self => {
      // All animations scoped to root element
      animate('.item', {
        scale: [0, 1],
        delay: stagger(100),
      });
      
      // Register reusable methods
      self.add('bounce', () => {
        animate('.item', {
          scale: [1, 1.2, 1],
          ease: spring({ bounce: 0.5 }),
        });
      });
    });

    // Cleanup on unmount
    return () => scope.current?.revert();
  }, []);

  const handleClick = () => {
    scope.current?.methods.bounce();
  };

  return (
    <div ref={root}>
      <div className="item">Animated</div>
      <button onClick={handleClick}>Bounce</button>
    </div>
  );
}
```

---

## 9. Draggable

```typescript
import { createDraggable, spring } from 'animejs';

createDraggable('.element', {
  container: 'parent',          // Constrain to parent
  container: [0, 0, 100, 100],  // Custom bounds [x,y,w,h]
  releaseEase: spring({ bounce: 0.5 }),
  
  onDrag: (draggable) => {
    console.log(draggable.x, draggable.y);
  },
  
  onRelease: (draggable) => {
    console.log('Released');
  },
});
```

---

## 10. Timeline

```typescript
import { createTimeline } from 'animejs';

const tl = createTimeline({
  defaults: {
    duration: 1000,
    ease: 'outExpo',
  },
});

tl.add('.element1', { translateX: 250 })
  .add('.element2', { translateY: 250 }, '-=500')  // Overlap 500ms
  .add('.element3', { scale: 2 }, '+=200');        // Delay 200ms

tl.play();
```

---

## 11. Keyframes

### Array Keyframes

```typescript
animate('.element', {
  translateX: [
    { to: 250, duration: 500 },
    { to: 0, duration: 500 },
  ],
  rotate: [
    { to: '1turn', duration: 1000 },
  ],
});
```

### Percentage Keyframes

```typescript
animate('.element', {
  keyframes: [
    { translateX: 0, offset: 0 },
    { translateX: 250, offset: 0.5 },
    { translateX: 100, offset: 1 },
  ],
  duration: 2000,
});
```

---

## 12. Common Patterns

### Fade In Elements

```typescript
animate('.element', {
  opacity: [0, 1],
  translateY: [20, 0],
  duration: 600,
  delay: stagger(100),
  ease: 'out(3)',
});
```

### Pulse Effect

```typescript
animate('.element', {
  scale: [1, 1.1, 1],
  duration: 1000,
  loop: true,
  ease: 'inOutQuad',
});
```

### Loading Spinner

```typescript
animate('.spinner', {
  rotate: '1turn',
  duration: 1000,
  loop: true,
  ease: 'linear',
});
```

### Staggered Grid Reveal

```typescript
animate('.grid-item', {
  scale: [0, 1],
  opacity: [0, 1],
  delay: stagger(50, {
    grid: [4, 4],
    from: 'center',
  }),
  ease: 'out(4)',
});
```

---

## Quick Reference

| Feature | API |
|---------|-----|
| Basic animation | `animate(target, props)` |
| Stagger | `stagger(value, options)` |
| Spring | `spring({ mass, stiffness, damping, bounce })` |
| React scope | `createScope({ root })` |
| Timeline | `createTimeline({ defaults })` |
| Draggable | `createDraggable(target, options)` |
| SVG draw | `svg.createDrawable(target)` |
| SVG morph | `svg.morphTo(target)` |
| Motion path | `svg.createMotionPath(path)` |

---

## Resources

- **Documentation**: https://animejs.com/documentation
- **Examples**: https://codepen.io/collection/Poerqa
- **Easing Editor**: https://animejs.com/easing-editor
- **GitHub**: https://github.com/juliangarnier/anime
