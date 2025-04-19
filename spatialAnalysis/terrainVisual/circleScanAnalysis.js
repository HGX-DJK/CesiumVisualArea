/**
 * @description iSpace工具集类
 * @param {Viewer} viewer 
 */
function circleScanAnalysis(viewer) {
    if (!Cesium.defined(viewer)) {
      throw new Cesium.DeveloperError("viewer undefined");
    }
    this.viewer = viewer;
    this.scene = this.viewer.scene;
    this.entities = [];   // 存储使用的entities
    this.primitives = []  // 存储使用的primitives
    this.handler =  new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.circleScanLayer = null;
}

/**
 * @description 水平面测距
 */
 circleScanAnalysis.prototype.horizontalDistance = function (callback) {
    var distance = 0; // 线段长度
    var distanceSum = 0; // 总长度
    var startPoint = null; // 起点
    var polylinePath = []; // 线段的两个点的集合
    var tempLine = null; // 临时线
    var position = null;
    var tempPoint = null;
    var line = null;
    var that = this;
    // 鼠标移动事件，实时获取鼠标位置
    this.handler.setInputAction(function (movement) {
      that.movingCartesian = that.getMoveHorizontalPosition(movement);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      // 鼠标左键单击事件
    this.handler.setInputAction(function (movement) {
      that.isDraw = true;
      position = that.getHorizontalPosition(movement);
      polylinePath.push(position.cartesian);
      if (polylinePath.length == 1) {
        // 线段起点和标签
        startPoint = that.viewer.entities.add({
          name:'点实体',
          position: position.cartesian,
          point: {
            color: Cesium.Color.SKYBLUE,
            pixelSize: 2,
            outlineColor: Cesium.Color.YELLOW,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: "起点",
            font: '14pt monospace',
            color: Cesium.Color.RED,
            backgroundColor: Cesium.Color.CORAL,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(50, 0),
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
        });
        // 临时线
        tempLine = that.viewer.entities.add({
          name:'线实体',
          polyline: {
            positions: new Cesium.CallbackProperty(function () {
              return [polylinePath[0], that.movingCartesian];
            }),
            material: Cesium.Color.BLUE,
            depthFailMaterial: Cesium.Color.BLUE,
            width: 2,
            clampToGround: true,
            classificationType: Cesium.ClassificationType.TERRAIN
          }
        });
        that.entities.push(startPoint);
        that.entities.push(tempLine);
      } else if (polylinePath.length > 1) {
        distance = that.getHorizontalDistance(polylinePath[0], polylinePath[1]);
        distanceSum += distance; // 总距离
        if(polylinePath.length == 2){
            var position1 = that.worldPosToLngAndLat(polylinePath[0]);
            var position2 = that.worldPosToLngAndLat(polylinePath[1])
            console.log(position1.lng,position1.lat);
            console.log(position2.lng,position2.lat);
            that.removeClickEvent();
            that.createViewershed(position1,distanceSum);
        }
        // 2点连线和中点标签
        line = that.viewer.entities.add({
          name:'点实体',
          polyline: {
            show: true,
            positions: [polylinePath[0], polylinePath[1]],
            material: Cesium.Color.BLUE,
            depthFailMaterial: Cesium.Color.BLUE,
            width: 2,
            clampToGround: true,
            classificationType: Cesium.ClassificationType.TERRAIN
          }
        });
        // 端点和标签
        tempPoint = that.viewer.entities.add({
            name:'点实体',
            position: position.cartesian,
            point: {
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              color: Cesium.Color.SKYBLUE,
              pixelSize: 2,
              outlineColor: Cesium.Color.YELLOW,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            label: {
              text: distanceSum.toFixed(2) + '米',
              font: '14pt monospace',
              color: Cesium.Color.RED,
              backgroundColor: Cesium.Color.CORAL,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.NONE,
              verticalOrigin: Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(50, 0),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
        that.entities.push(line,tempPoint);
        polylinePath.splice(0, 1);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
    // 鼠标右键单击事件
    this.handler.setInputAction(function () {
      if (that.isDraw) {
        that.isDraw = false;
        that.viewer.entities.remove(tempLine);
        if (polylinePath[0].equals(startPoint.position._value) && polylinePath.length == 1) {
          that.viewer.entities.remove(startPoint);
        }
        distanceSum = 0;
        polylinePath.length = 0;
      } else {
        callback('');
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

/**
 * @description 获取水平面坐标，针对鼠标移动事件
 * @param {*} move 
 * @returns 笛卡尔坐标
 */
 circleScanAnalysis.prototype.getMoveHorizontalPosition = function (move) {
    var ray = this.scene.camera.getPickRay(move.endPosition);
    var cartesian = this.scene.globe.pick(ray, this.scene);
    return cartesian;
}

/**
 * @description 获取水平面2点连线的中点，通过geodesic计算，不计算高度
 * @param {*} startPoint 
 * @param {*} endPoint 
 * @returns 水平面2点连线的中点的笛卡尔坐标，高度为0
 */
 circleScanAnalysis.prototype.getHorizontalMidpoint = function (startPoint, endPoint) {
    var spCartographic = Cesium.Cartographic.fromCartesian(startPoint);
    var epCartographic = Cesium.Cartographic.fromCartesian(endPoint);
    //实例化一个EllipsoidGeodesic对象，用于计算椭球体表面两点之间的最短路径（测地线）
    var geodesic = new Cesium.EllipsoidGeodesic();
    //计算两点间的测地线长度、初始/终止方位角等属性，为后续插值做准备
    geodesic.setEndPoints(spCartographic, epCartographic);
    //表示椭球体表面沿测地线的精确中点（忽略输入点的高度）
    var midpointCartographic = geodesic.interpolateUsingFraction(0.5);
    //将弧度制的地理坐标转换为三维笛卡尔坐标（Cartesian3）
    return Cesium.Cartesian3.fromRadians(midpointCartographic.longitude, midpointCartographic.latitude);
}

/**
 * @description 获取水平面坐标
 * @param {*} move 
 * @returns 笛卡尔坐标和地理坐标
 */
 circleScanAnalysis.prototype.getHorizontalPosition = function (move) {
    var ray = this.scene.camera.getPickRay(move.position);
    if (!Cesium.defined(ray)) {
      throw new Cesium.DeveloperError("get ray failed");
    }
    var cartesian = this.scene.globe.pick(ray, this.scene);
    if (!Cesium.defined(cartesian)) {
      throw new Cesium.DeveloperError("get cartesian failed");
    }
    var cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian);
    if (!Cesium.defined(cartographic)) {
      throw new Cesium.DeveloperError("get cartographic failed");
    }
    return { cartesian,cartographic };
  }

/**
 * @description 获取水平距离，通过geodesic计算
 * @param {*} startPoint 
 * @param {*} endPoint 
 * @returns 水平面2点距离
 */
circleScanAnalysis.prototype.getHorizontalDistance = function (startPoint, endPoint) {
    var spCartographic = Cesium.Cartographic.fromCartesian(startPoint);
    var epCartographic = Cesium.Cartographic.fromCartesian(endPoint);
    var geodesic = new Cesium.EllipsoidGeodesic();
    geodesic.setEndPoints(spCartographic, epCartographic);
    return geodesic.surfaceDistance;
}

/** 
 * @description 世界坐标转化为经纬度
 * @param {position} 位置 
*/
circleScanAnalysis.prototype.worldPosToLngAndLat = function(position) {
    let ellipsoid = this.viewer.scene.globe.ellipsoid;
    let cartesian3 = new Cesium.Cartesian3(position.x, position.y, position.z);
    let cartographic = ellipsoid.cartesianToCartographic(cartesian3);
    let lat = Cesium.Math.toDegrees(cartographic.latitude);
    let lng = Cesium.Math.toDegrees(cartographic.longitude);
    let height = cartographic.height;
    return { lng, lat, height }
}
  
/**
 * @description 可视域分析
 */
 circleScanAnalysis.prototype.createViewershed  = function (position1,distanceSum) { 
     // 开启地形深度监测
     this.viewer.scene.globe.depthTestAgainstTerrain = true;
     // 设定初始视角位置点
     var viewPoint = Cesium.Cartesian3.fromDegrees(position1.lng, position1.lat, position1.height);
     var viewPointEntity = this.viewer.entities.add({
        name:'初始视角位置点',
        position: viewPoint,
        ellipsoid: {
            radii: new Cesium.Cartesian3(5, 5, 5),
            material: Cesium.Color.YELLOW
        },
    });
    this.entities.push(viewPointEntity)
    // this.viewer.zoomTo(viewPointEntity)
    // 视角位置创建坐标轴
    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(viewPoint);
    var modelMatrixPrimitive = this.viewer.scene.primitives.add(new Cesium.DebugModelMatrixPrimitive({
        modelMatrix: transform,
        length: 10.0
    }));
    modelMatrixPrimitive.name = "视角坐标轴";
    this.primitives.push(modelMatrixPrimitive);

     // 世界坐标转换为投影坐标
    var webMercatorProjection = new Cesium.WebMercatorProjection(this.viewer.scene.globe.ellipsoid);
    var viewPointWebMercator = webMercatorProjection.project(Cesium.Cartographic.fromCartesian(viewPoint));
    
    //通视线数据集
    this.circleScanLayer = new Cesium.CustomDataSource("circleScan-layer");
    this.viewer.dataSources.add(this.circleScanLayer);
   
    // 目标点集合
    var destPoints = [];
    // 排除碰撞监测的对象
    var objectsToExclude = [viewPointEntity, modelMatrixPrimitive];

    // 观察点和目标点的距离（在世界坐标转换为投影坐标会有精度的丢失，此处进行补足）
    var radius = distanceSum + 230; 
    console.log(viewPointWebMercator);
    // 计算0°和360°之间的目标点
    for (var i = 0; i <= 360; i = i + 3) {
        // 度数转弧度
        var radians = Cesium.Math.toRadians(i);
        // 计算目标点
        var toPoint = new Cesium.Cartesian3(viewPointWebMercator.x + radius * Math.cos(radians), viewPointWebMercator.y + radius * Math.sin(radians),viewPointWebMercator.z);     
        // 投影坐标转世界坐标
        toPoint = webMercatorProjection.unproject(toPoint);
        destPoints.push(Cesium.Cartographic.toCartesian(toPoint.clone()));
    }
    // 一定要等3dtile模型加载完成后执行
    setTimeout(this.pickFromRay(destPoints,objectsToExclude,viewPoint),2000); 
 }
 
circleScanAnalysis.prototype.pickFromRay = function(destPoints,objectsToExclude,viewPoint) {
      for (var i = 0; i < destPoints.length; i++) {
        // 计算射线的方向，目标点left 视域点right
        var direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(destPoints[i], viewPoint, new Cesium.Cartesian3()), new Cesium.Cartesian3());
        // 建立射线
        var ray = new Cesium.Ray(viewPoint, direction);
        var result = this.viewer.scene.pickFromRay(ray, objectsToExclude); // 计算交互点，返回第一个
        this.showIntersection(result, destPoints[i], viewPoint);
    }
}

// 处理交互点
circleScanAnalysis.prototype.showIntersection = function(result, destPoint, viewPoint) {
    // 如果是场景模型的交互点，排除交互点是地球表面
    if (Cesium.defined(result) && Cesium.defined(result.object)) {
      this.drawLine(result.position, viewPoint, Cesium.Color.GREEN); // 可视区域
      this.drawLine(result.position, destPoint, Cesium.Color.RED); // 不可视区域
    } else {
      this.drawLine(viewPoint, destPoint, Cesium.Color.GREEN);
    }
}

// 绘制通视线
circleScanAnalysis.prototype.drawLine = function(leftPoint, secPoint, color) {
     var polyline = this.circleScanLayer.entities.add({
        name:'通视线',
        polyline: {
            positions: [leftPoint, secPoint],
            arcType: Cesium.ArcType.NONE,
            width: 2,
            material: color,
            depthFailMaterial: color
        }
    });
    this.entities.push(polyline);
}

//移除点击事件
circleScanAnalysis.prototype.removeClickEvent =function(){
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    this.handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

//通视分析取消
circleScanAnalysis.prototype.circleScanAnalysisCancel = function(){
    this.clearEntities();
    this.clearPrimitives();
    this.viewer.dataSources.remove(this.circleScanLayer)
    this.viewer.scene.globe.depthTestAgainstTerrain = false;  //关闭地形深度检测
    this.removeClickEvent();
}

/**
 * @description 清空实体
 */
 circleScanAnalysis.prototype.clearEntities = function () {
    for (var i = 0, len = this.entities.length; i < len; ++i) {
      this.viewer.entities.remove(this.entities[i]);
    }
    this.entities.length = 0;
  }

/**
 * @description 清空图元
 */
 circleScanAnalysis.prototype.clearPrimitives = function () {
    for (var i = 0, len = this.primitives.length; i < len; ++i) {
      this.scene.primitives.remove(this.primitives[i]);
    }
    this.primitives.length = 0;
  }
