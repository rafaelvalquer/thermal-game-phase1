export class RendererAdapter {
  constructor(renderer){if(!renderer)throw new TypeError('Renderer required');this.renderer=renderer;this.domElement=renderer.domElement;}
  render(scene,camera){return this.renderer.render(scene,camera);}
  setSize(width,height,updateStyle=false){this.renderer.setSize(width,height,updateStyle);}
  setPixelRatio(ratio){this.renderer.setPixelRatio(ratio);}
  dispose(){this.renderer.dispose();}
  get info(){return this.renderer.info;}
}
