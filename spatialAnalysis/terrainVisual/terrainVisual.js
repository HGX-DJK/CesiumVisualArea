/**
 * @description iSpace工具集类
 * @param {this.viewer} viewer 
 */
function TerrainVisual(viewer,type='twoPoint') {
    if (!Cesium.defined(viewer)) {
      throw new Cesium.DeveloperError("this.viewer undefined");
    }
    this.viewer = viewer;
    this.type = type
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
    const startCarto = Cesium.Cartographic.fromCartesian(startCartesian);
    const endCarto = Cesium.Cartographic.fromCartesian(endCartesian);
    const count = 300;
    let positions = [];
    for (let i = 0; i <= count; i++) {
        const lon = Cesium.Math.lerp(startCarto.longitude, endCarto.longitude, i / count);
        const lat = Cesium.Math.lerp(startCarto.latitude, endCarto.latitude, i / count);
        const height = Cesium.Math.lerp(startCarto.height, endCarto.height, i / count);
        positions.push(new Cesium.Cartographic(lon, lat, height));
    };
    const sampled = await Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, positions);
    console.log(sampled,"采样结果");
    let lastCartesian = Cesium.Cartesian3.fromRadians(sampled[0].longitude, sampled[0].latitude, sampled[0].height);
    for (let i = 1; i < sampled.length; i++) {
        const terrainHeight = sampled[i].height;
        const sightHeight = Cesium.Math.lerp(startCarto.height, endCarto.height, i / count);

        // 计算当前点与起点之间的视线高度
        const distanceToCurrent = Cesium.Cartesian3.distance(startCartesian,  Cesium.Cartesian3.fromRadians(sampled[i].longitude, sampled[i].latitude, sampled[i].height));
        const distanceToEnd = Cesium.Cartesian3.distance(startCartesian, endCartesian);
        // 根据视线的比例计算当前点的视线高度
        const expectedSightHeight = startCarto.height + (sightHeight - startCarto.height) * (distanceToCurrent / distanceToEnd);
  
        const current = Cesium.Cartesian3.fromRadians(
            sampled[i].longitude,
            sampled[i].latitude,
            sampled[i].height
        );
        console.log(terrainHeight,expectedSightHeight,"wwwwwwwwwww");
        
        const isCurrentlyVisible = terrainHeight < expectedSightHeight;
        // 绘制线段（红 or 绿）
        this.viewer.entities.add({
            polyline: {
                positions: [lastCartesian, current],
                width: 2,
                material: isCurrentlyVisible ? Cesium.Color.LIME : Cesium.Color.RED,
            },
        });

        // 更新起点
        lastCartesian = current;
    }
}


/**
 * @description 基于地形的扇形可视域分析
 * @param {*} center 
 * @param {*} target 
 * @param {*} radius 
 * @param {*} fov 
 * @param {*} rayCount 
 */
TerrainVisual.prototype.performSectorLOS = async function (center, target, radius = 1000, fov = 60,rayCount = 120) {
    const centerCarto = Cesium.Cartographic.fromCartesian(center);
    const centerHeight = centerCarto.height;

    // 计算方向向量
    const direction = Cesium.Cartesian3.subtract(target, center, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);

    // 得到 center 对应的 ENU 本地坐标系
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const invTransform = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    const localDir = Cesium.Matrix4.multiplyByPointAsVector(invTransform, direction, new Cesium.Cartesian3());

    const azimuth = Math.atan2(localDir.y, localDir.x); // 方位角
    const startAngle = azimuth - Cesium.Math.toRadians(fov / 2);
    const endAngle = azimuth + Cesium.Math.toRadians(fov / 2);

    // 每条射线角度步长
    const angleStep = (endAngle - startAngle) / rayCount;

    for (let i = 0; i <= rayCount; i++) {
        const angle = startAngle + angleStep * i;

        // 局部平面坐标中，构造目标点
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const localTarget = new Cesium.Cartesian3(x, y, 0);

        // 转回世界坐标
        const worldTarget = Cesium.Matrix4.multiplyByPoint(transform, localTarget, new Cesium.Cartesian3());

        // 计算插值点
        const count = 200;
        let positions = [];
        for (let j = 0; j <= count; j++) {
            const interp = Cesium.Cartesian3.lerp(center, worldTarget, j / count, new Cesium.Cartesian3());
            positions.push(Cesium.Cartographic.fromCartesian(interp));
        }

        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, positions);

        // 绘制段
        let last = Cesium.Cartesian3.fromRadians(sampled[0].longitude, sampled[0].latitude, sampled[0].height);
        for (let j = 1; j < sampled.length; j++) {
            const terrainH = sampled[j].height;

            const endCarto = Cesium.Cartographic.fromCartesian(worldTarget);
            //获取扇形当前的终点和起点的视点高度
            const sightH = Cesium.Math.lerp(centerHeight, endCarto.height, j / count); // 假设目标高度为地面

            const distanceToCurrent = Cesium.Cartesian3.distance(center, Cesium.Cartesian3.fromRadians(sampled[j].longitude, sampled[j].latitude, sampled[j].height));
            const distanceToEnd = Cesium.Cartesian3.distance(center, worldTarget);
            
            // 根据视线的比例计算当前点的视线高度
            const expectedSightHeight = centerHeight + (sightH - centerHeight) * (distanceToCurrent / distanceToEnd); // 目标假设在地面
            const curr = Cesium.Cartesian3.fromRadians(
                sampled[j].longitude,
                sampled[j].latitude,
                sampled[j].height
            );

            const visible = terrainH < expectedSightHeight;

            viewer.entities.add({
                polyline: {
                    positions: [last, curr],
                    width: 1.5,
                    material: visible ? Cesium.Color.LIME.withAlpha(0.7) : Cesium.Color.RED.withAlpha(0.7)
                }
            });

            last = curr;
        }
    }
}