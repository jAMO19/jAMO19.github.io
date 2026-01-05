/*const map = L.map('distribution-map-container').setView([54.5, -126.5], 9); 

const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    attribution: '© OpenStreetMap contributors', 
    maxZoom: 19
});

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
    attribution: 'Tiles © Esri', 
    maxZoom: 19
}); 

streetMap.addTo(map); 

*/ 

let map; 
let streetMap; 
let satellite; 
let legend; 
let layerControl; 

let riskGeoRaster = null; 
let deadTreesGeoRaster = null; 

let rasterLayer = null; 
//let rasterLayerGroup = null; 

const rasterData = [ 
    { file:'tree_mortality_2018_clipped.tif', label: '2018 Mortalities' }, 
    { file:'tree_mortality_2019_clipped.tif', label: '2019 Mortalities' },
    { file:'tree_mortality_2020_clipped.tif', label: '2020 Mortalities' }
]; 





function initMap() {
    // Completely destroy and recreate the map
    if (map) {
        map.remove();
        map = null;
    } 

    const parentContainer = document.getElementById('distribution-map-container').parentNode;
    const oldContainer = document.getElementById('distribution-map-container');
    
    // Recreate the map container DOM element 
    const newContainer = document.createElement('div'); 
    newContainer.id = 'distribution-map-container';
    newContainer.style.cssText = oldContainer.style.cssText; 

    parentContainer.replaceChild(newContainer, oldContainer);
    
    
    //container.innerHTML = ''; // Clear everything
    
    map = L.map('distribution-map-container', { 
        minZoom: 5,  // Minimum zoom level (e.g., to keep the whole region visible)
        maxZoom: 7, // Maximum zoom level (e.g., to prevent raster pixelation)
        zoomSnap: 1, // Optional: ensures zoom levels stay at integers
        zoomDelta: 1 // Optional: distance jumped per zoom click
    }).setView([54.5, -126.5], 5); 

    if (!L.Control.prototype._bottomcenter) {
        L.Control.prototype._bottomcenter = function() {
            return this._map._controlCorners['bottomcenter'];
        };
    }
    
    const corners = map._controlCorners;
    const container = map._controlContainer;
    
    if (!corners['bottomcenter']) {
        corners['bottomcenter'] = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', container);
    } 

    streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap contributors', 
        maxZoom: 7
    });

    satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
        attribution: 'Tiles © Esri', 
        maxZoom: 7
    }); 

    streetMap.addTo(map);
    
    // Add layer control
    const baseMaps = { 
        "Street Map": streetMap,
        "Satellite": satellite 
    }; 

    layerControl = L.control.layers(baseMaps, null, { position:'topright' }).addTo(map); 
    
    // Add legend
    legend = L.control({ position: 'bottomleft' }); 
    legend.onAdd = function(m) { 
        const div = L.DomUtil.create('div', 'legend'); 
        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

        div.innerHTML = `<h4 style="margin: 0 0 8px 0; font-size: 14px;">Tree Mortalities</h4>
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(223, 17, 17, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">>25</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(223, 93, 17, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">15-25</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(255, 140, 0, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">10-14</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(241, 238, 27, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">4-9</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(211, 240, 48, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">3</span>
</div>`; 

        return div;
    }; 
    legend.addTo(map); 

    const navControl = L.control({ position: 'bottomcenter' });

    navControl.onAdd = function(m) {
        const div = L.DomUtil.create('div', 'map-nav-control');
        div.innerHTML = `
            <button id="prevRaster" class="nav-btn">
                <i class="fas fa-chevron-left"></i>
            </button>
            <span id="rasterTitle" class="raster-title">2018 Mortality</span>
            <button id="nextRaster" class="nav-btn">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
        
        // Prevent map interactions when clicking controls
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
    };

    navControl.addTo(map);


    
    // Add click handler for querying raster data
    map.on('click', function(e) { 
        const lat = e.latlng.lat; 
        const lng = e.latlng.lng; 

        let deadTreeCount = 'N/A'; 
        
        if (deadTreesGeoRaster) { 
            try { 
                const values = geoblaze.identify(deadTreesGeoRaster, [lng, lat]);
                deadTreeCount = values[0];
            } catch (err) { 
                console.log('Error identifying pixel:', err); 
            } 
        } 

        if (deadTreeCount !== 'N/A' && deadTreeCount !== -128) {
            L.popup().setLatLng(e.latlng).setContent(`Number of Dead Trees: ${deadTreeCount}`).addTo(map);
        }
    });
    
    map.on('baselayerchange', function(e) { 
        if (rasterLayer && map.hasLayer(rasterLayer)) { 
            rasterLayer.bringToFront();
        }
    });
}









function getMortalityColor(value, georaster) { 
    if (value === null || value === undefined || value === georaster.noDataValue) { 
        return 'rgba(0, 0, 0, 0)'; 
    } 
    if (value >= 25) return 'rgba(223, 17, 17, 0.8)'; 
    if (value >= 15) return 'rgba(223, 93, 17, 0.8)'; 
    if (value >= 10) return 'rgba(255, 140, 0, 0.8)'; 
    if (value >= 4) return 'rgba(241, 238, 27, 0.8)'; 
    if (value >= 3) return 'rgba(211, 240, 48, 0.8)'; 
    if (value >= 2) return 'rgba(152, 233, 23, 0.8)';
    if (value >= 1) return 'rgba(63, 241, 27, 0.8)';
    if (value >= 0) return 'rgba(6, 185, 15, 0.75)'; 
    
    //const min = -128;
    //const max = 26;
    //const normalized = (value - min) / (max - min);
    
    // Create green gradient from light to dark
    // Light green for low values, dark green for high values 
    //const red = 0;
    //const green = Math.floor(100 + (normalized * 155)); // 255 to 155
    //const blue = Math.floor(50 + (normalized * 50)); // Small amount of red for variety
    

    return 'rgba(0, 0, 0, 0)'; 

} 

let currentRasterIndex = 0;

//let rasterLayerGroup = null;

function loadRaster(index) { 
    const data = rasterData[index]; 

    //document.getElementById('rasterTitle').innerText = data.label; 

    initMap(); 

    setTimeout(() => {
        const prevBtn = document.getElementById('prevRaster');
        const nextBtn = document.getElementById('nextRaster'); 
        const titleSpan = document.getElementById('rasterTitle'); 

        if (titleSpan) {
            titleSpan.innerText = data.label;
        }
        
        if (prevBtn && nextBtn) { 
            prevBtn.onclick = () => {
                currentRasterIndex = (currentRasterIndex === 0) ? rasterData.length - 1 : currentRasterIndex - 1; 
                loadRaster(currentRasterIndex);
            };
            
            nextBtn.onclick = () => {
                currentRasterIndex = (currentRasterIndex === rasterData.length - 1) ? 0 : currentRasterIndex + 1; 
                loadRaster(currentRasterIndex);
            };
        }
    }, 100);

    fetch(data.file)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => parseGeoraster(arrayBuffer))
    .then(georaster => { 
        

        /*
        rasterLayer = new GeoRasterLayer({ 
            georaster: georaster, 
            opacity: 0.8, 
            pixelValuesToColorFn: (values) =>  getMortalityColor(values[0], georaster),
            resolution: 256, 
            updateWhenIdle: false, 
            updateWhenZooming: true 
        });

        rasterLayer.addTo(map); 

        setTimeout(() => { 
            map.invalidateSize(); 
            if (rasterLayer._map) { 
                rasterLayer.redraw();
            } 
        }, 100); 

        document.getElementById('rasterTitle').innerText = data.label;

        //map.invalidateSize(); 

        //map.fitBounds(rasterLayer.getBounds()); 
        
        //document.getElementById('rasterTitle').innerText = data.label; 
        //}, 50); 

        /* map.eachLayer(function(layer) { 
            //console.log("Checking layer:", layer);
            if (layer.isMyRaster || (layer.options && layer.options.georaster)) {
                try { 
                    console.log("Could remove a layer");
                    map.removeLayer(layer); 
                    //rasterLayer = null;
                } catch (e) {
                    console.warn("Could not remove a lingering layer", e);
                }
            }
        }); */ 

        //map.eachLayer(function(layer) {
            //if (layer instanceof L.GridLayer) {
                //layer.redraw();
            //}
        //});

        deadTreesGeoRaster = georaster; 

    




        //const timestamp = Date.now(); 

        setTimeout(() => { 
            rasterLayer = new GeoRasterLayer({ 
                georaster: georaster, 
                opacity: 0.8, 
                pixelValuesToColorFn: (values) => {
                    // Force new function reference each time
                    const val = values[0];
                    if (val === null || val === undefined || val === georaster.noDataValue) { 
                        return 'rgba(0, 0, 0, 0)'; 
                    } 
                    if (val >= 25) return 'rgba(223, 17, 17, 0.8)'; 
                    if (val >= 15) return 'rgba(223, 93, 17, 0.8)'; 
                    if (val >= 10) return 'rgba(255, 140, 0, 0.8)'; 
                    if (val >= 4) return 'rgba(241, 238, 27, 0.8)'; 
                    if (val >= 3) return 'rgba(211, 240, 48, 0.8)'; 
                    if (val >= 2) return 'rgba(152, 233, 23, 0.8)';
                    if (val >= 1) return 'rgba(63, 241, 27, 0.8)';
                    if (val >= 0) return 'rgba(6, 185, 15, 0.75)'; 
                    return 'rgba(0, 0, 0, 0)';
                },
                resolution: 256 
                //minZoom: 12, 
                //maxZoom: 300
            }); 

            rasterLayer.addTo(map);
        
            //document.getElementById('rasterTitle').innerText = data.label; 

            const titleSpan = document.getElementById('rasterTitle');
            if (titleSpan) {
                titleSpan.innerText = data.label;
            }


        }, 200);
        
        

        /*
         setTimeout(() => {
            deadTreesGeoRaster = georaster; 

            // Create new layer with inline color function
            rasterLayer = new GeoRasterLayer({ 
                georaster: georaster, 
                opacity: 0.8, 
                pixelValuesToColorFn: (values) => {
                    const val = values[0];
                    if (val === null || val === undefined || val === georaster.noDataValue) { 
                        return 'rgba(0, 0, 0, 0)'; 
                    } 
                    if (val >= 25) return 'rgba(223, 17, 17, 0.8)'; 
                    if (val >= 15) return 'rgba(223, 93, 17, 0.8)'; 
                    if (val >= 10) return 'rgba(255, 140, 0, 0.8)'; 
                    if (val >= 4) return 'rgba(241, 238, 27, 0.8)'; 
                    if (val >= 3) return 'rgba(211, 240, 48, 0.8)'; 
                    if (val >= 2) return 'rgba(152, 233, 23, 0.8)';
                    if (val >= 1) return 'rgba(63, 241, 27, 0.8)';
                    if (val >= 0) return 'rgba(6, 185, 15, 0.75)'; 
                    return 'rgba(0, 0, 0, 0)';
                },
                resolution: 256
            });

            rasterLayer.addTo(map);
            
            document.getElementById('rasterTitle').innerText = data.label;
        }, 100); // 100ms delay */

        //rasterLayer.isMyRaster = true;

       

        

    })
    .catch(err => { 
        console.error("Error loading raster:", err) 
        document.getElementById('rasterTitle').innerText = data.label + ' (Error)'; 
         if (titleSpan) {
            titleSpan.innerText = data.label + ' (Error)';
        }
    }); 
    
} 

/*document.getElementById('prevRaster').addEventListener('click', () => {
    currentRasterIndex = (currentRasterIndex === 0) ? rasterData.length - 1 : currentRasterIndex - 1; 
    //console.log(currentRasterIndex);
    loadRaster(currentRasterIndex);
});

document.getElementById('nextRaster').addEventListener('click', () => {
    currentRasterIndex = (currentRasterIndex === rasterData.length - 1) ? 0 : currentRasterIndex + 1; 
    //console.log(currentRasterIndex);
    loadRaster(currentRasterIndex);
}); 

*/



loadRaster(0); 

/*
/* fetch('tree_mortality_2018_clipped.tif') 
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => { 
        parseGeoraster(arrayBuffer).then(georaster => { 


            deadTreesGeoRaster = georaster;  

            rasterLayer = new GeoRasterLayer({ 
                georaster: georaster, 
                opacity: 0.8, 
                pixelValuesToColorFn: (values, x, y) => { 
                    const val = values[0]; 
                    if (fishnetBounds) { 
                        const point = L.latLng(y, x); 
                        let inBounds = false; 

                        fishnetBounds.eachLayer(layer => {
                            if (layer.getBounds().contains(point)) {
                                inBounds = true;
                            }
                        }); 

                        if (!inBounds) {
                            return 'rgba(0, 0, 0, 0)';
                        }
                    }
                    return getMortalityColor(val, georaster);
                },
                resolution: 256
            }); 

            rasterLayer.addTo(map);
            map.fitBounds(rasterLayer.getBounds()); 
        });
    })
    .catch(error => { 
        console.log('Mortality data error:', error); 
        createDemoVisualization();
    }); 

    */

/*
map.on('click', function(e) { 
    const lat = e.latlng.lat; 
    const lng = e.latlng.lng; 

    let deadTreeCount = 'N/A'; 
    
    if (deadTreesGeoRaster) { 
        try { 
            const values = geoblaze.identify(deadTreesGeoRaster, [lng, lat]);
            deadTreeCount = values[0];
        } catch (err) { 
            console.log('Error identifying pixel:', err); 
        } 

    } 


    if (deadTreeCount != 'N/A' && deadTreeCount != -128) {
        L.popup().setLatLng(e.latlng).setContent(`Number of Dead Trees: ${deadTreeCount}`).addTo(map);
    }

    
});


function createDemoVisualization() { 
    const highRiskZone = L.polygon([ 
        [54.5, -126.5], [54.5, -126.0], [54.0, -126.0], [54.0, -126.5]
    ], { color: 'blue', fillOpacity: 0.3 }).addTo(map);
}

const baseMaps = { 
    "Street Map": streetMap,
    "Satellite": satellite 
}; 

//const layerControl = L.control.layers(baseMaps, null, { position:'topright' }).addTo(map); 

map.on('baselayerchange', function(e) { 
    if (rasterLayer && map.hasLayer(rasterLayer)) { 
        rasterLayer.bringToFront();
    }
});

//const legend = L.control({ position: 'bottomleft' }); 

legend.onAdd = function(map) { 

    const div = L.DomUtil.create('div', 'legend'); 
    div.style.backgroundColor = 'white';
    div.style.padding = '10px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';


    div.innerHTML = `<h4 style="margin: 0 0 8px 0; font-size: 14px;">Mortality Risk</h4>
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(223, 17, 17, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">>25</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(223, 93, 17, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">15-25</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(255, 140, 0, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">10-14</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(241, 238, 27, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">4-9</span>
</div> 
<div style="display: flex; align-items: center; margin: 4px 0;">
    <div style="width: 20px; height: 20px; background: rgba(211, 240, 48, 0.7); margin-right: 8px; border-radius: 3px;"></div>
    <span style="font-size: 12px;">3</span>
</div> 
`; 

    return div; // <--- You MUST return the div

}; 

legend.addTo(map); 

*/
