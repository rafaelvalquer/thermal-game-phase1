export class CoolingPathGeometryCache {
  constructor({monitor=null}={}){this.monitor=monitor;this.paths=new WeakMap();}

  get(path,network){
    const cached=this.paths.get(path);if(cached)return cached;
    const unit=path.unit||network.sourceUnit,pointsCount=path.path.length+2,segments=new Array(pointsCount-1);let totalLength=0;
    let ax=unit.x+.5,ay=unit.y+.5;
    for(let i=0;i<pointsCount-1;i++){
      const next=i<path.path.length?path.path[i]:path.vent,bx=next.x+.5,by=next.y+.5,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
      segments[i]={ax,ay,dx,dy,start:totalLength,length};totalLength+=length;ax=bx;ay=by;
    }
    const geometry={segments,totalLength};this.paths.set(path,geometry);this.monitor?.count?.('coolingPathAllocations');return geometry;
  }

  static segmentAt(segments,distance){
    let low=0,high=segments.length-1;
    while(low<high){const middle=(low+high)>>1,segment=segments[middle];if(distance>segment.start+segment.length)low=middle+1;else high=middle;}
    return segments[low];
  }
}
