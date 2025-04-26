/**
 * author:hgx
 * @description s实现具体步骤讲解：
 *  1、根据起点和终点计算方法向量，归一化
 *  2、根据起点和归一化方向向量获得Cesium射线
 *  3、计算起点和终点的距离；
 *  4、设置取样间隔，获取取样数量，取消间隔越小，越准确；
 *  5、根据Cesium射线获取取样点的笛卡尔坐标集合；
 *  6、根据viewer.terrainProvider地形,和取样点集合，获取对应集合点的高程
 *  7、根据射线获取的集合点高度，和该段取样高程对比判断，如果大于，则可见，小于则不可见
 *  8、然后根据可见为绿色，不可加为红色，循环绘制。
 */

/**
 * @description iSpace工具集类
 * @param {this.viewer} viewer 
 */
function TerrainVisual(viewer,type='twoPoint') {
    if (!Cesium.defined(viewer)) {
      throw new Cesium.DeveloperError("this.viewer undefined");
    }
    this.viewer = viewer;
    this.type = type;
}

/**
 * @description 水平面测距
 */
TerrainVisual.prototype.startTerrainAnalysis = function () {
    let points = [];
    var that = this;
    this.viewer.screenSpaceEventHandler.setInputAction(async function (click) {
        const cartesian = that.viewer.scene.pickPosition(click.position);
        if (!cartesian) return;
        that.viewer.entities.add({
            position: cartesian,
            ellipsoid: {
                radii: new Cesium.Cartesian3(2, 2, 2),
                material: Cesium.Color.YELLOW,
                // 贴地
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // 无论对象距离相机多远，​​完全禁用​​深度测试
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
        });
        points.push(cartesian);
        //当获取两个点的时候执行结果
        if(points.length === 2) {
            // 计算两点之间的直线距离
            const distance = Cesium.Cartesian3.distance(points[0], points[1]);
            console.log(distance,"距离");
            if(that.type == 'twoPoint'){
                await that.performLOSAnalysis(points[0], points[1],distance);
            }else{
                await that.performSectorLOS(points[0], points[1],distance);
            };
            points = [];
        };
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * @description 两点的通视分析
 * @param {*} startCartesian 
 * @param {*} endCartesian 
 */
TerrainVisual.prototype.performLOSAnalysis = async function (startCartesian, endCartesian) {
    const start = startCartesian;
    const end = endCartesian;
    const direction = Cesium.Cartesian3.subtract(end, start, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction); // 归一化方向向量

    const ray = new Cesium.Ray(start, direction);
    const distance = Cesium.Cartesian3.distance(start, end);
    const steps = Math.ceil(distance / 10);
    const positions = [];
  
    for (let i = 0; i <= steps; i++) {
      const point = Cesium.Ray.getPoint(ray, (i / steps) * distance);
      const carto = Cesium.Cartographic.fromCartesian(point);
      positions.push(carto);
    };
    let lastCartesian = startCartesian;
    var that = this;
    Cesium.sampleTerrainMostDetailed(that.viewer.terrainProvider, positions).then((samples) => {
       for (let i = 0; i < samples.length; i++) {
            let rayPoint = Cesium.Ray.getPoint(ray, (i / steps) * distance);
            const carto = Cesium.Cartographic.fromCartesian(rayPoint);
            let visualFlag = false;
            if (carto.height >  samples[i].height) {
                visualFlag = true; // 被遮挡
            };
            let sampleCartesian = Cesium.Cartesian3.fromRadians(samples[i].longitude, samples[i].latitude,samples[i].height);
            // 绘制线段（红 or 绿）
            that.viewer.entities.add({
                polyline: {
                    positions: [lastCartesian, sampleCartesian],
                    width: 2,
                    material: visualFlag ? Cesium.Color.LIME : Cesium.Color.RED,
                    clampToGround: true
                },
            });
            lastCartesian = sampleCartesian;
        };
    });
}

/**
 * @description 基于地形的扇形可视域分析
 * @param {*} center 
 * @param {*} target 
 * @param {*} radius 
 * @param {*} fov 
 * @param {*} rayCount 
 */
TerrainVisual.prototype.performSectorLOS = async function (center, target, radius = 1000, fov = 360,rayCount = 240) {
    // 计算方向向量
    const direction = Cesium.Cartesian3.subtract(target, center, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);
    // 得到 center 对应的 ENU 本地坐标系
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const invTransform = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    const localDir = Cesium.Matrix4.multiplyByPointAsVector(invTransform, direction, new Cesium.Cartesian3());
    // 方位角
    const azimuth = Math.atan2(localDir.y, localDir.x); 
    // 起始角度
    const startAngle = azimuth - Cesium.Math.toRadians(fov / 2);
    // 结束角度
    const endAngle = azimuth + Cesium.Math.toRadians(fov / 2);
    // 每条射线角度步长
    const angleStep = (endAngle - startAngle) / rayCount;
    for (let i = 0; i <= rayCount; i++) {
        const angle = startAngle + angleStep * i;
        // 局部平面坐标中，构造目标点
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const localTarget = new Cesium.Cartesian3(x, y, 0);
        // 转回世界坐标,得到的是笛卡尔坐标系
        const worldTarget = Cesium.Matrix4.multiplyByPoint(transform, localTarget, new Cesium.Cartesian3());
        this.performLOSAnalysis(center,worldTarget);
    }
}