const map = L.map('story-map').setView([50.0, -125.5], 8); 

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
        icon: 'road', 
        color: '#e76f51' 
    }, 

    { 
        id: 'courtenay-downtown', 
        coords: [49.6912, -124.9998], 
        title: 'Downtown Courtenay', 
        description: 'Parking study', 
        image: '20231007_111644.jpg',
        icon: 'road', 
        color: '#e76f51' 
    }, 

    { 
        id: 'port-hardy', 
        coords: [50.7112, -127.9621], 
        title: 'Holberg', 
        description: 'Boring hole locations', 
        image: '20231127_103505.jpg', 
        icon: 'road', 
        color: '#e76f51' 
    }

]; 

let isManualScrolling = false;

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
                <img src="${project.image}" alt="${project.title}" style="width:100%; height:200px; object-fit:cover; border-radius:5px; margin-bottom:8px;">
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


    marker.on('click', function() {
        map.flyTo(project.coords, 14, { duration: 1.5 }); 
        const targetSection = document.querySelector('.story-section[data-location="' + project.id + '"]'); 
        if (targetSection && storyPanel) { 
            const sectionTop = targetSection.offsetTop; 

            storyPanel.scrollTo({ 
                top: sectionTop,
                behavior: 'smooth'  
                //block: 'start'
            }); 

            marker.openPopup(); 


            isManualScrolling = true; 
            setTimeout(() => {
                isManualScrolling = false;
            }, 1000);
        }
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

    if (activeSection) { 
        sections.forEach(s => s.classList.remove('active')); 
        activeSection.classList.add('active'); 

        const lat = activeSection.dataset.lat; 
        const lon = activeSection.dataset.lon; 
        const zoom = activeSection.dataset.zoom; 
        const location = activeSection.dataset.location; 

        if (lat && lon && zoom) { 
            map.flyTo([parseFloat(lat), parseFloat(lon)], parseInt(zoom), { 
                duration: 1.5, 
                easeLinearity: 0.25
            }); 

            if (markers[location]) { 
                markers[location].openPopup();
            }
        }
    }
}); 

setTimeout(() => { 
    sections[0].classList.add('active'); 
}, 500);

