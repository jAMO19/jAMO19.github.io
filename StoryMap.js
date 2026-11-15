const map = L.map('story-map').setView([50.0, -125.5], 5); 

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map); 

const projects = [ 
    { 
        id: 'john-hart-dam', 
        coords: [50.0422, -125.3386], 
        title: 'John Hart Dam', 
        description: 'BC Hydro Project', 
        image: '20250905_085206.jpg',
        icon: 'truck', 
        color: '#e76f51' 
    }, 

    { 
        id: 'courtenay-downtown', 
        coords: [49.6912, -124.9998], 
        title: 'Downtown Courtenay', 
        description: 'Parking Study', 
        image: '20231007_111644.jpg',
        icon: 'car', 
        color: '#e76f51' 
    }, 

    { 
        id: 'port-hardy', 
        coords: [50.7112, -127.9621], 
        title: 'Holberg', 
        description: 'Bore Hole Locations', 
        image: '20231127_103505.jpg', 
        icon: 'tree', 
        color: '#e76f51' 
    }, 

    { 
        id: 'campbell-river', 
        coords: [50.0184, -125.2662], 
        title: 'Campbell River', 
        description: 'Traffic Counting Study', 
        image: 'Traffic_Counter_2.jpg', 
        icon: 'road', 
        color: '#e76f51' 
    }, 

    { 
        id: 'cold-lake', 
        coords: [54.6134, -110.4731], 
        title: 'Cold Lake, Alberta', 
        description: 'Wellpad Scannning', 
        image: 'NAVVIS_Scanner.jpg', 
        icon: 'road', 
        color: '#e76f51'
    }

    

]; 

let isManualScrolling = false; 
let currentLocation = 'intro'; 
let pendingOpen = null; 
const MARKER_OFFSET_Y = 150;

const markers = {}; 
projects.forEach(project => { 
    const customIcon = L.divIcon({ 
        className: 'custom-marker', 
        html: `<div style="background: ${project.color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 3px solid white;"><i class="fas fa-${project.icon}"></i></div>`,
        iconSize: [40, 40], 
        iconAnchor: [20, 20]
    }); 

    const marker = L.marker(project.coords, { icon: customIcon })
        .addTo(map) 
        .bindPopup(`
            <div class="custom-popup"> 
                <img src="${project.image}" alt="${project.title}" style="width:100%; height:360px; object-fit:cover; border-radius:5px; margin-bottom:8px;">
                <h3>${project.title}</h3>
                <p>${project.description}</p>
            </div>
        `, { 
            maxWidth: 300, 
            className: 'modern-popup', 
            offset: [0, 10],
            autoPan: true,
            autoPanPadding: [50, 50]
            
            //minWidth: 250
        }); 


    /* marker.on('click', function() {
        map.flyTo(project.coords, 14, { duration: 1.5 }); 
        const targetSection = document.querySelector('.story-section[data-location="' + project.id + '"]'); 
        if (targetSection && storyPanel) { 
            const sectionTop = targetSection.offsetTop; 

            storyPanel.scrollTo({ 
                top: sectionTop,
                behavior: 'smooth'  
                //block: 'start'
            }); 

            setTimeout(() => {
                marker.openPopup(); 
                // Pan the map down by 150 pixels so the marker sits higher up 
                // and leaves room for the 200px tall popup image above it
                map.panBy([550, -800], { animate: true, duration: 0.5 });
            }, 1000);

            //marker.openPopup(); 


            isManualScrolling = true; 
            setTimeout(() => {
                marker.openPopup(); 
                isManualScrolling = false;
            }, 1000);
        }
    });

    markers[project.id] = marker;
}); 

*/ 

    marker.on('click', function () {
        isManualScrolling = true; 
        currentLocation = project.id;

        flyToOffset(project.coords, 14, MARKER_OFFSET_Y, () => marker.openPopup());

        const targetSection = document.querySelector(
            '.story-section[data-location="' + project.id + '"]'
        );
        if (targetSection) {
            storyPanel.scrollTo({ top: targetSection.offsetTop, behavior: 'smooth' });
        }

        setTimeout(() => { isManualScrolling = false; }, 1600);
    }); 

     markers[project.id] = marker;

});


const storyPanel = document.getElementById('storyPanel'); 
const sections = document.querySelectorAll('.story-section'); 
const progressFill = document.getElementById('progressFill'); 

storyPanel.addEventListener('scroll', () => { 
    
    if (isManualScrolling) return;
    
    const scrollPercent = (storyPanel.scrollTop / (storyPanel.scrollHeight - storyPanel.clientHeight)) * 100; 
    progressFill.style.width = scrollPercent + '%'; 

    let activeSection = null;
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight / 2 && rect.bottom > window.innerHeight / 2) {
            activeSection = section;
        }
    });
    if (!activeSection) return; 

    sections.forEach(s => s.classList.remove('active'));
    activeSection.classList.add('active');

    const location = activeSection.dataset.location;
    if (location === currentLocation) return;   // same section: don't re-fly
    currentLocation = location;

    const lat  = parseFloat(activeSection.dataset.lat);
    const lon  = parseFloat(activeSection.dataset.lon);
    const zoom = parseFloat(activeSection.dataset.zoom);

    map.closePopup();

    const marker = markers[location];
    flyToOffset(
        marker ? marker.getLatLng() : [lat, lon],   // land exactly where a click would
        zoom,
        marker ? MARKER_OFFSET_Y : 0,
        marker ? () => marker.openPopup() : null
    );

    /*if (activeSection) { 
        sections.forEach(s => s.classList.remove('active')); 
        activeSection.classList.add('active'); 

        const lat = activeSection.dataset.lat; 
        const lon = activeSection.dataset.lon; 
        const zoom = activeSection.dataset.zoom; 
        const location = activeSection.dataset.location; 

        if (location == currentLocation) {
            return; 
        } 
        
        currentLocation = location; 

        map.closePopup(); 

        const marker = markers[location];
        flyToOffset(
            marker ? marker.getLatLng() : [lat, lon],   // land exactly where a click would
            zoom,
            marker ? MARKER_OFFSET_Y : 0,
            marker ? () => marker.openPopup() : null
        ); 
        */

        /*if (lat && lon && zoom) { 
            /* map.flyTo([parseFloat(lat), parseFloat(lon)], parseInt(zoom), { 
                duration: 1.5, 
                easeLinearity: 0.25
            });  

            const hasMarker = !!markers[location]; 
            flyToOffset([parseFloat(lat), parseFloat(lon)], parseInt(zoom), hasMarker ? MARKER_OFFSET_Y : 0, hasMarker ? () => markers[location].openPopup() : null);
        }
            //map.closePopup();

            /*if (markers[location]) { 
                markers[location].openPopup();

                
            }*/
        //} 
}); 

setTimeout(() => { 
    sections[0].classList.add('active'); 
}, 500); 

// How far below the map's vertical center the pin should land (px).
// Raise it to push the pin lower, lower it to bring the pin closer to center.
//const MARKER_OFFSET_Y = 150;

//let pendingOpen = null;

function flyToOffset(latlng, zoom, offsetY, onDone) {
    // Work in pixel space at the *target* zoom, then move the center UP by offsetY.
    // A center that's higher on the map puts the pin lower on the screen.
    const point = map.project(L.latLng(latlng), zoom).subtract([0, offsetY]);
    const target = map.unproject(point, zoom);

    // Cancel any popup-open that's still waiting from a previous fly
    if (pendingOpen) map.off('moveend', pendingOpen);
    pendingOpen = null;

    if (onDone) {
        pendingOpen = () => { pendingOpen = null; onDone(); };
        map.once('moveend', pendingOpen);
    }

    map.flyTo(target, zoom, { duration: 2.0, easeLinearity: 0.25 });
}