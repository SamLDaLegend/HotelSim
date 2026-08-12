// A POOL OF LABELS, because a `Text` per frame allocates a texture per frame.
//
// The only reason this file exists is cost: everything else in the view is a rectangle in
// one `Graphics`, which is cheap to rebuild sixty times a second, and text is not. The pool
// holds `Text` objects across frames and hides the ones a frame did not use.
//
// IT HOLDS NO SIMULATION STATE. What survives a frame here is a display object and a string
// that was computed from the world the frame drew — the same class of thing as the camera
// or a scroll position. Nothing here is authoritative and nothing here is read back.

import { Container, Text, TextStyle } from 'pixi.js';

export type LabelStyle = {
  readonly size: number;
  readonly colour: number;
  readonly bold?: boolean;
  /** 0 left, 1 right. Defaults to left. */
  readonly anchorX?: number;
  /** 0 top, 1 bottom. Defaults to top. */
  readonly anchorY?: number;
};

const FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export class TextPool {
  readonly container = new Container();
  private readonly pool: Text[] = [];
  private used = 0;

  /** Start a frame. Nothing is destroyed; the unused tail is hidden in `end`. */
  begin(): void {
    this.used = 0;
  }

  text(value: string, x: number, y: number, style: LabelStyle): void {
    let label = this.pool[this.used];
    if (label === undefined) {
      label = new Text({ text: value, style: new TextStyle({ fontFamily: FAMILY, fontSize: style.size }) });
      this.pool.push(label);
      this.container.addChild(label);
    }
    label.visible = true;
    if (label.text !== value) label.text = value;
    label.style.fontSize = style.size;
    label.style.fontWeight = style.bold === true ? 'bold' : 'normal';
    label.style.fill = style.colour;
    label.anchor.set(style.anchorX ?? 0, style.anchorY ?? 0);
    label.position.set(x, y);
    this.used += 1;
  }

  /** Hide whatever this frame did not use, so a shrinking hotel does not leave ghosts. */
  end(): void {
    for (let i = this.used; i < this.pool.length; i += 1) {
      const label = this.pool[i];
      if (label !== undefined) label.visible = false;
    }
  }
}
