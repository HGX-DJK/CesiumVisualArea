# Cesium 实现可视化

## 一、使用ShadowMap 使用可视域

## 二、在内置地形下使用shadowMap不生效

**主要是因为**：

* Cesium 的默认地形（Cesium World Terrain）是基于 GPU 加速的地形渲染技术（如 GlobeSurfaceTileProvider），不是普通的 Primitive 或 Model

* 而 ShadowMap 的原理依赖的是 从光源（或观察点）渲染视角下场景中所有参与阴影投影的图元（geometry）

## 三、使用Ray Casting实现地形可视域
