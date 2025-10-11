// Configuración del flipbook
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Iniciando flipbook...');
    
    // CONFIGURACIÓN IMPORTANTE: Cambia este número por el total de tus páginas
    const TOTAL_PAGES = 10;
    
    const book = {
        numPages: () => TOTAL_PAGES,
        
        getPage: (pageNum, callback) => {
            const pageNumber = pageNum + 1;
            // Asegúrate que esta ruta coincida con tus archivos
            const imagePath = `assets/pdf-images/page-${pageNumber}.jpg`;
            
            console.log(`🔄 Cargando página ${pageNumber}: ${imagePath}`);
            
            const img = new Image();
            img.src = imagePath;
            
            img.onload = () => {
                console.log(`✅ Página ${pageNumber} cargada correctamente`);
                callback(null, img);
            };
            
            img.onerror = () => {
                console.error(`❌ Error al cargar: ${imagePath}`);
                console.log('Verifica que:');
                console.log('1. El archivo existe en assets/pdf-images/');
                console.log('2. Se llama page-' + pageNumber + '.jpg');
                console.log('3. La imagen no está corrupta');
                createFallbackPage(pageNumber, callback);
            };
        }
    };

    // Crear página de respaldo si hay error
    function createFallbackPage(pageNumber, callback) {
        console.log(`🔄 Creando página de respaldo ${pageNumber}`);
        
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        
        // Fondo
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Texto
        ctx.fillStyle = '#333';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Página ${pageNumber}`, canvas.width / 2, canvas.height / 2);
        ctx.font = '16px Arial';
        ctx.fillText('Imagen no disponible', canvas.width / 2, canvas.height / 2 + 40);
        
        const img = new Image();
        img.src = canvas.toDataURL();
        img.onload = () => callback(null, img);
    }

    // Inicializar flipbook
    let flipbookViewer;
    
    function initializeFlipbook() {
        if (typeof init !== 'undefined') {
            init(book, 'flipbook-container', (err, viewer) => {
                if (err) {
                    console.error('❌ Error inicializando flipbook:', err);
                    showError();
                } else {
                    console.log('✅ Flipbook inicializado correctamente');
                    flipbookViewer = viewer;
                    setupControls(viewer);
                    setupKeyboardNavigation(viewer);
                    updateTotalPages(TOTAL_PAGES);
                    updateControls();
                }
            });
        } else {
            console.error('❌ Flipbook Viewer no se cargó correctamente');
            setTimeout(initializeFlipbook, 100); // Reintentar
        }
    }

    function setupControls(viewer) {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageIndicator = document.getElementById('page-indicator');

        function updateControls() {
            if (!viewer) return;
            const currentPage = viewer.get_page_num() + 1;
            const totalPages = viewer.page_count;
            
            pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;
            prevBtn.disabled = currentPage === 1;
            nextBtn.disabled = currentPage === totalPages;
        }

        prevBtn.addEventListener('click', () => {
            viewer.prev_page();
            updateControls();
        });

        nextBtn.addEventListener('click', () => {
            viewer.next_page();
            updateControls();
        });

        viewer.on('seen', updateControls);
        updateControls();
    }

    function setupKeyboardNavigation(viewer) {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                viewer.prev_page();
                updateControls();
            } else if (e.key === 'ArrowRight') {
                viewer.next_page();
                updateControls();
            }
        });
    }

    function updateTotalPages(total) {
        const totalPagesElement = document.getElementById('total-pages');
        if (totalPagesElement) {
            totalPagesElement.textContent = total;
        }
    }

    function showError() {
        const container = document.getElementById('flipbook-container');
        container.innerHTML = `
            <div class="error-message">
                <h3>⚠️ Error al cargar el flipbook</h3>
                <p>Por favor, verifica que:</p>
                <ul>
                    <li>Las imágenes estén en la carpeta <strong>assets/pdf-images/</strong></li>
                    <li>Los archivos se llamen <strong>page-1.jpg, page-2.jpg, etc.</strong></li>
                    <li>El número total de páginas en script.js sea correcto</li>
                    <li>Revisa la consola del navegador (F12) para más detalles</li>
                </ul>
            </div>
        `;
    }

    // Inicializar cuando todo esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFlipbook);
    } else {
        initializeFlipbook();
    }
});
