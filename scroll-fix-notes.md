# Scroll-fix lösning

## Nyckelinsikt från StackOverflow
Använd MouseSensor + TouchSensor ISTÄLLET FÖR PointerSensor.

PointerSensor lider av begränsningar med touch-events - den kan inte skilja scroll från drag pålitligt.
TouchSensor med delay + tolerance fungerar MYCKET bättre för touch-enheter.

```js
const sensors = useSensors(
  useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 500,
      tolerance: 8,
    },
  }),
);
```

## Viktigt
- Ta bort touchAction: 'none' från draggable elements
- touchAction: 'manipulation' är rekommenderat av dnd-kit docs
- Touch events lider INTE av samma begränsningar som Pointer events
- Det ÄR möjligt att förhindra scroll i touchmove events (men inte i pointermove)
