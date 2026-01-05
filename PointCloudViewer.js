let scene, camera, renderer, controls, pointCloud; 
let pointsMaterial; 
let stats = { fps: 0, lastTime: performance.now(), frames: 0 }; 
let pointsData = { positions: [], colors: [], intensities: [], classifications: [], count: 0 }; 
let bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; 
let classificationFilter = { ground: true, unclassified: true }; 

function init() { 
    
    scene = new THREE.Scene(); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000); 

    camera.position.set(50, 50, 50); 
    const container = document.getElementById('point_cloud_render_area');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight); 
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight); 

    setupControls(); 

    setBackground('dark'); 

    window.addEventListener('resize', onWindowResize); 

    animate();
} 

function setupControls() { 

    // Initialize OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    
    // Smoothness and damping
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05; 
    
    // Zoom settings
    controls.screenSpacePanning = true; 

    // Optional: Limit vertical rotation so you don't flip the map upside down
    //controls.maxPolarAngle = Math.PI / 2; 
    
    controls.target.set(0, 0, 0);
    controls.update();// Keeps camera above ground
/*
    let isDragging = false; 
    let isPanning = false; 
    let previousMousePosition = { x: 0, y: 0 }; 
    const rotationSpeed = 0.005; 
    const panSpeed = 0.5; 

    renderer.domElement.addEventListener('mousedown', (event) => { 
        if (event.button === 0) { 
            isDragging = true; 
        } 
        if (event.button === 2) { 
            isPanning = true; 
        } 

        previousMousePosition = { x: event.clientX, y: event.clientY };

    }); 

    renderer.domElement.addEventListener('mouseup', () => { 
        isDragging = false; 
        isPanning = false; 
    }); 


    //edit this
    renderer.domElement.addEventListener('mousemove', (event) => { 
        if (isDragging) { 
            const deltaX = event.clientX - previousMousePosition.x; 
            const deltaY = event.clientY - previousMousePosition.y; 

            const radius = camera.position.length(); 
            const theta = Math.atan2(camera.position.x, camera.position.z); 
            const phi = Math.acos(camera.position.y / radius); 

            const newTheta = theta - deltaX * rotationSpeed; 
            const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - deltaY * rotationSpeed)); 

            camera.position.x = radius * Math.sin(newPhi) * Math.cos(newTheta); 
            camera.position.y = radius * Math.cos(newPhi); 
            camera.position.z = radius * Math.sin(newPhi) * Math.sin(newTheta); 
            camera.lookAt(scene.position); 
             
        } 

        if (isPanning) { 
            const deltaX = event.clientX - previousMousePosition.x; 
            const deltaY = event.clientY - previousMousePosition.y; 

            const right = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            camera.getWorldDirection(right); 
            right.cross(up).normalize();

            camera.position.addScaledVector(right, -deltaX * panSpeed * 0.1); 
            camera.position.y += deltaY * panSpeed * 0.1; 
        } 
        
        previousMousePosition = { x: event.clientX, y: event.clientY };
    }); 

    renderer.domElement.addEventListener('wheel', (event) => { 
        event.preventDefault();
        const zoomSpeed = 0.1; 
        const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        camera.position.multiplyScalar(delta)
    }); 

    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());*/

} 

function setBackground(type) { 
    if (type === 'dark') { 
        scene.background = new THREE.Color(0x101010); 
    } else if (type === 'light') { 
        scene.background = new THREE.Color(0xf0f0f0); 
    } else { 
        scene.background = new THREE.Color(0x1a1a2e); 
    } 
} 

function loadLAZFile(file) { 
    showLoading(true, 'Reading file...'); 

    const reader = new FileReader(); 
    reader.onload = function(event) { 
        try { 
            parseLAZ(event.target.result, file.size);
        } 
        catch (error) { 
            console.error('Error parsing LAZ file:', error); 
            alert('Error loading LAZ file. Make sure the file is valid.'); 
            showLoading(false)
        } 
        //console.error('It worked'); 
            //alert('It worked');
    }; 
    
    reader.readAsArrayBuffer(file); 


} 

function parseLAZ(arrayBuffer, fileSize) { 
    
    
    showLoading(true, 'Parsing LAZ file...'); 

    const view = new DataView(arrayBuffer); 

    const pointDataOffset = view.getUint32(96, true); 
    const pointDataRecordLength = view.getUint16(105, true); 
    const numPointRecords = view.getUint32(107, true); 
    const pointDataFormat = view.getUint8(104);
    
    console.log('=== LAS FILE INFO ===');
    console.log('Point Data Format:', pointDataFormat);
    console.log('Point Data Offset:', pointDataOffset);
    console.log('Point Record Length:', pointDataRecordLength);
    console.log('Number of Points:', numPointRecords);


    const scaleX = view.getFloat64(131, true); 
    const scaleY = view.getFloat64(139, true); 
    const scaleZ = view.getFloat64(147, true); 

    const offsetX = view.getFloat64(155, true); 
    const offsetY = view.getFloat64(163, true); 
    const offsetZ = view.getFloat64(171, true); 

    //const pointData = new Uint8Array(arrayBuffer, pointDataOffset); 

    const maxPoints = parseInt(document.getElementById('maxPoints').value) * 1_000_000; 

    const skip = Math.max(1, Math.floor(numPointRecords / maxPoints)); 
 
    pointsData = { positions: [], colors: [], intensities: [], classifications: [], count: 0 }; 
    bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; 

    for (let i = 0; i < numPointRecords; i += skip) { 

        if (i % 100000 === 0) { 
            updateProgress((i / numPointRecords) * 100); 
            document.getElementById('loadingText').textContent = `Loading points: ${(i / 1_000_000).toFixed(1)}M / ${(numPointRecords / 1_000_000).toFixed(1)}M`; 
        } 

        const offset = pointDataOffset + (i * pointDataRecordLength); 

        const x = view.getInt32(offset, true) * scaleX + offsetX; 
        const y = view.getInt32(offset + 4, true) * scaleY + offsetY; 
        const z = view.getInt32(offset + 8, true) * scaleZ + offsetZ; 
        
        const intensity = view.getUint16(offset + 12, true); 

        const classification = view.getUint8(offset + 15) & 0x1F; 

        let r, g, b; 
        if(pointDataFormat === 3) {
            r = view.getUint16(offset + 28, true) / 65535; 
            g = view.getUint16(offset + 30, true) / 65535; 
            b = view.getUint16(offset + 32, true) / 65535; 
        } else {
            r = view.getUint16(offset + 20, true) / 65535;
            g = view.getUint16(offset + 22, true) / 65535;
            b = view.getUint16(offset + 24, true) / 65535;
        }

        pointsData.positions.push(x, y, z); 
        pointsData.colors.push(r, g, b); 
        pointsData.intensities.push(intensity / 65535); 
        pointsData.classifications.push(classification); 

        bounds.min[0] = Math.min(bounds.min[0], x); 
        bounds.min[1] = Math.min(bounds.min[1], y); 
        bounds.min[2] = Math.min(bounds.min[2], z); 

        bounds.max[0] = Math.max(bounds.max[0], x); 
        bounds.max[1] = Math.max(bounds.max[1], y); 
        bounds.max[2] = Math.max(bounds.max[2], z); 

        if (i === 0) {
            console.log('=== FIRST POINT DATA ===');
            console.log('Position:', x, y, z); 
            console.log('RGB (normalized):', r, g, b);
            console.log('RGB (raw):', 
                view.getUint16(offset + 20, true),
                view.getUint16(offset + 22, true),
                view.getUint16(offset + 24, true)
            ); 

            console.log('Intensity:', intensity); 
            console.log('Classification:', classification);
        }

    } 

    pointsData.count = pointsData.positions.length / 3; 

    const centerX = (bounds.min[0] + bounds.max[0]) / 2; 
    const centerY = (bounds.min[1] + bounds.max[1]) / 2; 
    const centerZ = (bounds.min[2] + bounds.max[2]) / 2; 

    //camera.position.set(centerX, centerY, centerZ); 

    for (let i = 0; i < pointsData.positions.length; i += 3) { 
        pointsData.positions[i] -= centerX; 
        pointsData.positions[i + 1] -= centerY; 
        pointsData.positions[i + 2] -= centerZ; 
    } 

    createPointCloud(); 
    fitCameraToPoints(); 

    document.getElementById('numPoints').textContent = pointsData.count.toLocaleString(); 
    document.getElementById('fileSize').textContent = (fileSize / (1024 * 1024)).toFixed(2) + ' MB'; 

    showLoading(false); 
} 

function createPointCloud() { 
    if (pointCloud) { 
        scene.remove(pointCloud); 
        pointCloud.geometry.dispose(); 
        pointCloud.material.dispose(); 
    } 

    const filteredData = filterPointsByClassification();

    const geometry = new THREE.BufferGeometry(); 
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(filteredData.positions, 3)); 
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(filteredData.colors, 3)); 
    geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(filteredData.intensities, 1)); 

    pointsMaterial = new THREE.PointsMaterial({ 
        size: 0.01, 
        vertexColors: true, 
        sizeAttenuation: true, 
        transparent: true, 
        opacity: 0.8 
    }); 

    pointCloud = new THREE.Points(geometry, pointsMaterial); 

    scene.add(pointCloud); 

    updateColorMode();

} 

function filterPointsByClassification() { 
    const filtered = { 
        positions: [],
        colors: [],
        intensities: [], 
        count: 0
    }; 

    for (let i = 0; i < pointsData.count; i++) { 
        const classification = pointsData.classifications[i]; 
        
        // Example: filter for ground points 
        const showPoint = 
            (classification === 0 && classificationFilter.unclassified) || 
            (classification === 1 && classificationFilter.unclassified) ||
            (classification === 2 && classificationFilter.ground) || 
            (classification > 2);

        if (showPoint) {
            filtered.positions.push(pointsData.positions[i * 3], pointsData.positions[i * 3 + 1], pointsData.positions[i * 3 + 2]);
            filtered.colors.push(pointsData.colors[i * 3], pointsData.colors[i * 3 + 1], pointsData.colors[i * 3 + 2]);
            filtered.intensities.push(pointsData.intensities[i]);
            filtered.count++;
        }
    }

    return filtered;
} 

function updateClassificationFilter() { 
    classificationFilter.ground = document.getElementById('showGround').checked; 
    classificationFilter.unclassified = document.getElementById('showUnclassified').checked; 

    if (pointsData.count > 0) {
        //const filtered = filterPointsByClassification();
        //pointsData = filtered;
        createPointCloud();
    }
}

function updateColorMode() { 
    if (!pointCloud) return; 

    const mode = document.getElementById('colorMode').value;  

    const filteredData = filterPointsByClassification();

    if (mode === 'rgb') { 
        pointCloud.geometry.setAttribute('color', new THREE.Float32BufferAttribute(filteredData.colors, 3)); 
        pointsMaterial.vertexColors = true; 
    } 

    else if(mode === 'elevation') {
 
        const colors = []; 
        for (let i = 0; i < pointsData.positions.length; i += 3) { 
            const z = pointsData.positions[i + 2]; 
            const normalizedZ = (z - bounds.min[2]) / (bounds.max[2] - bounds.min[2]); 
            const color = new THREE.Color(); 
            color.setHSL(0.7 - normalizedZ * 0.7, 1, 0.5); 
            colors.push(color.r, color.g, color.b); 
        } 

        pointCloud.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
        pointsMaterial.vertexColors = true; 
    } 
    
    else if (mode === 'intensity') { 
        const colors = []; 
        for (let i = 0; i < pointsData.intensities.length; i++) { 
            const intensity = pointsData.intensities[i]; 
            colors.push(intensity, intensity, intensity);
        }
        pointCloud.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
        pointsMaterial.vertexColors = true;  
    } 

    else if (mode === 'classification') { 
        const colors = []; 
        let filteredIndex = 0; 

        for (let i = 0; i < pointsData.count; i++) { 
            const classification = pointsData.classifications[i]; 
            const showPoint = 
                (classification === 2 && classificationFilter.ground) || 
                (classification === 1 && classificationFilter.unclassified) || 
                (classification !== 1 && classification !== 2) || 
                (classification > 2);

            if (showPoint) { 
                let color; 
                switch(classification) {
                    
                    case 0: // Never classified
                        color = new THREE.Color(0.7, 0.7, 0.7); // Gray
                        break;
                    case 1: // Unclassified
                        color = new THREE.Color(0.8, 0.8, 0.8); // Light Gray
                        break;
                    case 2: // Ground
                        color = new THREE.Color(0.6, 0.4, 0.2); // Brown
                        break;
                    case 3: // Low Vegetation
                        color = new THREE.Color(0.2, 0.8, 0.2); // Light Green
                        break;
                    case 4: // Medium Vegetation
                        color = new THREE.Color(0.1, 0.6, 0.1); // Green
                        break;
                    case 5: // High Vegetation
                        color = new THREE.Color(0.0, 0.4, 0.0); // Dark Green
                        break;
                    case 6: // Building
                        color = new THREE.Color(0.8, 0.2, 0.2); // Red
                        break;
                    case 9: // Water
                        color = new THREE.Color(0.3, 0.6, 0.9); // Blue
                        break;
                    default:
                        color = new THREE.Color(1, 1, 1); // White
                }
                colors.push(color.r, color.g, color.b);
                filteredIndex++; 
            }
        }

        pointCloud.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
        pointsMaterial.vertexColors = true;  
    } 
}

function fitCameraToPoints() { 
    if (pointsData.count === 0) return; 

    const size = Math.max( 
        bounds.max[0] - bounds.min[0], 
        bounds.max[1] - bounds.min[1], 
        bounds.max[2] - bounds.min[2]
    ); 

    const distance = size * 0.5; 
    camera.position.set(distance, distance, distance); 
    camera.lookAt(0, 0, 0);
} 

function showLoading(show, text = 'Loading...') { 
    const overlay = document.getElementById('loading'); 
    if (show) { 
        overlay.classList.remove('hidden'); 
        document.getElementById('loadingText').textContent = text;
    } else { 
        overlay.classList.add('hidden'); 
    }
} 

function updateProgress(percent){ 
    document.getElementById('progressBar').style.width = percent + '%';
}

function onWindowResize() { 
    const container = document.getElementById('point_cloud_render_area')
    camera.aspect = container.clientWidth / container.clientHeight; 
    camera.updateProjectionMatrix(); 
    renderer.setSize(container.clientWidth, container.clientHeight); 
} 

function animate() { 
    requestAnimationFrame(animate); 

    if (controls) { 
        controls.update();
    }

    stats.frames++; 
    const currentTime = performance.now(); 
    if(currentTime >= stats.lastTime + 1000) { 
        stats.fps = Math.round((stats.frames * 1000) / (currentTime - stats.lastTime)); 
        stats.frames = 0; 
        stats.lastTime = currentTime; 
        document.getElementById('fps').textContent = stats.fps; 
    } 


    if (pointCloud) { 
        document.getElementById('renderedPoints').textContent = pointsData.count.toLocaleString();
    } 

    renderer.render(scene, camera); 

} 

document.getElementById('fileInput').addEventListener('change', (event) => { 
    const file = event.target.files[0]; 
    if (file) { 
        loadLAZFile(file);
    }
}); 

document.getElementById('pointSize').addEventListener('input', (event) => { 
    const value = parseFloat(event.target.value); 
    document.getElementById('pointSizeValue').textContent = value.toFixed(2); 
    if (pointCloud && pointCloud.material) {
        pointCloud.material.size = value;
    }
});

document.getElementById('maxPoints').addEventListener('input', (event) => { 
    const value = parseFloat(event.target.value); 
    document.getElementById('maxPointsValue').textContent = value.toFixed(1);
}); 

document.getElementById('colorMode').addEventListener('change', (event) => { 
    updateColorMode();
}); 

document.getElementById('background').addEventListener('change', (event) => { 
    setBackground(event.target.value);
}); 

document.getElementById('resetCamera').addEventListener('click', () => { 
    fitCameraToPoints();
}); 

document.getElementById('showGround').addEventListener('change', updateClassificationFilter); 
document.getElementById('showUnclassified').addEventListener('change', updateClassificationFilter); 

init(); 

window.addEventListener('load', () => {
    const defaultPointCloudUrl = 'Buckley_Bay-L2-cropped.las'; // Or 'assets/your-file.las'
    
    showLoading(true, 'Loading default point cloud...');
    
    fetch(defaultPointCloudUrl)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load point cloud');
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            parseLAZ(arrayBuffer, arrayBuffer.byteLength);
        })
        .catch(error => {
            console.error('Error loading default point cloud:', error);
            showLoading(false);
            alert('Failed to load default point cloud. You can still upload your own file.');
        });
});