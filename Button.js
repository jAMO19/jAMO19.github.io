document.querySelectorAll('a[href^="#"]').forEach(anchor => { 
  anchor.addEventListener('click', function(e) { 
    e.preventDefault(); 
    const target = document.querySelector(this.getAttribute('href')); 
    if (target) { 

      const navHeight = document.querySelector('nav').offsetHeight; 

      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20; 


      window.scrollTo({ 
        top: targetPosition, 
        behavior: 'smooth'
      })
    }
  });
}); 

const navbar = document.getElementById('navbar'); 
window.addEventListener('scroll', () => { 
  if (window.scrollY > 100) { 
    navbar.classList.add('scrolled'); 
  } 
  else { 
    navbar.classList.remove('scrolled');
  }
})


const observerOptions = { 
  threshold: 0.1, 
  rootMargin: '0px 0px -100px 0px'
}; 

const observer = new IntersectionObserver((entries) => { 
  entries.forEach(entry => { 
    if (entry.isIntersecting) { 
      entry.target.style.opacity = '1'; 
      entry.target.style.transform = 'translateY(0)'; 
    }
  });
}, observerOptions);

document.querySelectorAll('project-card, .skill-card').forEach(card => { 
  card.style.opacity = '0'; 
  card.style.transform = 'translateY(20px)'; 
  card.style.transition = 'opacity 0.6s ease, transform 0.6s ease'; 
  observer.observe(card);
}); 

document.querySelectorAll('.video-panel-wrapper').forEach(wrapper => {  
  const video = wrapper.querySelector('.hover-video'); 
  if (video) { 
    wrapper.addEventListener('mouseenter', () => {
      video.play();
    });
    wrapper.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  } 
});