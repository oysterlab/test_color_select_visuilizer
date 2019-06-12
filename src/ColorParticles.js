const THREE = require('three')
const GPUComputationRenderer = require('../lib/GPUComputationRenderer')(THREE)
const glsl = require('glslify')
const path = require('path')
import sort from 'fast-sort'

function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return { r, g, b }
}

class ColorParticles {

    constructor(renderer, option) {
        const {
            rowCount, 
            particleWidth, 
            cubeWidth, 
            isRandomPosition
        } = option

        const textureWidth = Math.sqrt(rowCount * rowCount * rowCount)
        const textureHeight = textureWidth

        const boxIndexes = new Float32Array(textureWidth * textureHeight * 2)
        for(let y = 0; y < textureHeight; y++) {
            for(let x = 0; x < textureWidth; x++) {
                const i = (y * textureWidth + x) * 2

                boxIndexes[i + 0] = x / textureWidth
                boxIndexes[i + 1] = y / textureHeight
            }
        }

        const geometry = new THREE.InstancedBufferGeometry()
        geometry.copy(new THREE.BoxBufferGeometry(particleWidth, particleWidth, particleWidth))
        
        geometry.addAttribute('boxIndex', new THREE.InstancedBufferAttribute(boxIndexes, 2, 1))
     
        const gpuCompute = new GPUComputationRenderer(textureWidth, textureHeight, renderer)

        const initPosTexture= gpuCompute.createTexture()
        const fromPosTexture= gpuCompute.createTexture()
        const toPosTexture= gpuCompute.createTexture()        
        const colorMapTexture = gpuCompute.createTexture()

        const colors = []
        for(let i = 0; i < fromPosTexture.image.data.length; i+=4) {
            const i_ = parseInt(i / 4)

            const xi = (!isRandomPosition) ? (i_ % rowCount) / rowCount : Math.random()
            const yi = (!isRandomPosition) ? ((parseInt((i_ / rowCount)) % rowCount) / rowCount) : Math.random()
            const zi = (!isRandomPosition) ? (parseInt(i_ / (rowCount * rowCount))) / rowCount : Math.random()

            initPosTexture.image.data[i + 0] = (xi - 0.5) * cubeWidth
            initPosTexture.image.data[i + 1] = (yi - 0.5) * cubeWidth
            initPosTexture.image.data[i + 2] = (zi - 0.5) * cubeWidth
            initPosTexture.image.data[i + 3] = 1

            fromPosTexture.image.data[i + 0] = initPosTexture.image.data[i + 0]
            fromPosTexture.image.data[i + 1] = initPosTexture.image.data[i + 1]
            fromPosTexture.image.data[i + 2] = initPosTexture.image.data[i + 2]
            fromPosTexture.image.data[i + 3] = initPosTexture.image.data[i + 3]

            toPosTexture.image.data[i + 0] = initPosTexture.image.data[i + 0]
            toPosTexture.image.data[i + 1] = initPosTexture.image.data[i + 1]
            toPosTexture.image.data[i + 2] = initPosTexture.image.data[i + 2]
            toPosTexture.image.data[i + 3] = initPosTexture.image.data[i + 3]

            const { r, g, b } = HSVtoRGB(xi, 1.0 - yi, zi)
            colorMapTexture.image.data[i + 0] = r
            colorMapTexture.image.data[i + 1] = g
            colorMapTexture.image.data[i + 2] = b
            colorMapTexture.image.data[i + 3] = 1

            // colorMapTexture.image.data[i + 0] = xi
            // colorMapTexture.image.data[i + 1] = yi
            // colorMapTexture.image.data[i + 2] = zi
            // colorMapTexture.image.data[i + 3] = 1


            colors.push([r, g, b])
        }

        const dtPositionLogic = glsl(path.resolve(__dirname, './shaders/dtPosition.glsl'))
        const positionVariable = gpuCompute.addVariable("fromTexture", dtPositionLogic, fromPosTexture)
        gpuCompute.setVariableDependencies(positionVariable, [positionVariable])
        positionVariable.material.uniforms.toTexture = { type: 't', value: toPosTexture }
        positionVariable.material.uniforms.uProgress = { type: 'f', value: 0 }

        gpuCompute.init()

        var material = new THREE.ShaderMaterial({
        vertexShader: glsl(path.resolve(__dirname, './shaders/vertex.glsl')),
        fragmentShader: glsl(path.resolve(__dirname, './shaders/fragment.glsl')),
            uniforms: {
                positionTexture: {
                    type: 't', value: null
                },
                colorMapTexture: {
                    type: 't', value: colorMapTexture
                }
            }
        });

        const cube = new THREE.Mesh(geometry, material );

        this.gpuCompute = gpuCompute
        this.cube = cube
        this.positionVariable = positionVariable
        this.colorMapTexture = colorMapTexture

        this.initPosTexture = initPosTexture
        this.fromPosTexture = fromPosTexture
        this.toPosTexture = toPosTexture
        
        this.cubeWidth = cubeWidth
        this.renderer = renderer
        this.rowCount = rowCount

        this.colors = colors
        this.isRandomPosition = isRandomPosition
        // const gpu = new GPU()

        // const particleCount = rowCount * rowCount * rowCount
        // const particleOutputWidth = Math.sqrt(particleCount)
        // this.sortingColors = gpu.createKernel(function(a) {

        // }).setOutput([rowCount * rowCount, rowCount])
    }

    addToScene(scene) {
        scene.add(this.cube)
    }

    render(t) {
        let {
             gpuCompute, cube, positionVariable,
             initPosTexture, fromPosTexture, toPosTexture,
             cubeWidth, rowCount } = this
             
        if (positionVariable.material.uniforms.uProgress.value < 1.0)
            positionVariable.material.uniforms.uProgress.value += 0.01
        else
            positionVariable.material.uniforms.uProgress.value = 1.0

        positionVariable.material.uniforms.uProgress.needsUpdate = true
        gpuCompute.compute()
        cube.material.uniforms.positionTexture.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
    }

    isUpdateReady() {
        return this.positionVariable.material.uniforms.uProgress.value == 1.0
    }

    updateWithPredictValues(ys) {
        let {
            gpuCompute, cube, positionVariable,
            initPosTexture, fromPosTexture, toPosTexture,
            cubeWidth, rowCount } = this

        console.log('check', toPosTexture.image.data.length / 4, ys.length)

        for(let i = 0; i < toPosTexture.image.data.length; i+=4) {
            const i_ = i / 4
            const xi = (i_ % rowCount) / rowCount
            const yi = (parseInt((i_ / rowCount)) % rowCount) / rowCount
            const zi = (parseInt(i_ / (rowCount * rowCount))) / rowCount

            const diff = ys[i_] - 0.5
            const padding = 0.1

            toPosTexture.image.data[i + 1] = (diff < 0) ? (diff - padding) * cubeWidth : (diff + padding) * cubeWidth
        }

        toPosTexture.needsUpdate = true

        positionVariable.material.uniforms.uProgress.value = 0.0;
        positionVariable.material.uniforms.fromTexture.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
        positionVariable.material.uniforms.toTexture.value = toPosTexture

        positionVariable.material.uniforms.uProgress.needsUpdate = true
        positionVariable.material.uniforms.fromTexture.needsUpdate = true
        positionVariable.material.uniforms.toTexture.needsUpdate = true          
    }

    updateWithCubeShape(ys) {
        let {
            gpuCompute, cube, positionVariable,
            initPosTexture, fromPosTexture, toPosTexture,
            isRandomPosition,
            cubeWidth, rowCount } = this

        console.log('check', toPosTexture.image.data.length / 4, ys.length)    

        for(let z = 0; z < rowCount; z++) {
            
            for (let x = 0; x < rowCount; x++) {
                let wy = []
                let by = []
                
                for (let y = 0; y < rowCount; y++) {
                    const v = ys[x + y * rowCount + z * rowCount * rowCount]
                    const p = {
                        yi: y,
                        idx: x + y * rowCount + z * rowCount * rowCount,
                        v
                    }

                    if (v > 0.5) {
                        wy.push(p)
                    } else {
                        by.push(p)
                    }
                }

                wy = sort(wy).asc() 
                by = sort(by).asc() 

                const particleInterval = cubeWidth / rowCount

                for (let i = 0; i < wy.length; i++) {
                    const { idx, yi, v } = wy[i]
                    let y_ = -particleInterval * i
                    if(isRandomPosition) {
                        y_ += particleInterval * Math.random()
                    }
                    toPosTexture.image.data[idx * 4 + 1] = y_ + cubeWidth - particleInterval
                    toPosTexture.image.data[idx * 4 + 2] = initPosTexture.image.data[idx * 4 + 2] - cubeWidth
                 }

                for (let i = 0; i < by.length; i++) {
                    const { idx, yi, v } = by[i]
                    let y_ = particleInterval * i
                    if(isRandomPosition) {
                        y_ += particleInterval * Math.random()
                    }
                    toPosTexture.image.data[idx * 4 + 1] = y_
                    toPosTexture.image.data[idx * 4 + 2] = initPosTexture.image.data[idx * 4 + 2]
                }
            }
        }

        toPosTexture.needsUpdate = true
        
        positionVariable.material.uniforms.uProgress.value = 0.0;
        positionVariable.material.uniforms.fromTexture.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
        positionVariable.material.uniforms.toTexture.value = toPosTexture

        positionVariable.material.uniforms.uProgress.needsUpdate = true
        positionVariable.material.uniforms.fromTexture.needsUpdate = true
        positionVariable.material.uniforms.toTexture.needsUpdate = true        
        
    }

    getColors() {
        return this.colors
    }
}

export default ColorParticles