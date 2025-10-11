// Configuración del flipbook
document.addEventListener('DOMContentLoaded', function() {
    const book = {
        numPages: () => 10, // Cambia este número según tus páginas
        
        getPage: (pageNum, callback) => {
            const img = new Image();
            // Asegúrate de que las imágenes estén en assets/pdf-images/
            img.src = `assets/pdf-images/page-${pageNum + 1}.jpg`;
            img.onload = () => {
                console.log(`Página ${pageNum + 1} cargada correctamente`);
                callback(null, img);
            };
            img.onerror = (error) => {
                console.error(`Error cargando página ${pageNum + 1}:`, error);
                // Imagen de respaldo si hay error
                createFallbackPage(pageNum + 1, callback);
            };
        }
    };

    // Crear página de respaldo
    function createFallbackPage(pageNumber, callback) {
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
    
    if (typeof init !== 'undefined') {
        init(book, 'flipbook-container', (err, viewer) => {
            if (err) {
                console.error('Error inicializando flipbook:', err);
                showError();
            } else {
                console.log('✅ Flipbook inicializado correctamente');
                flipbookViewer = viewer;
                setupControls(viewer);
                setupKeyboardNavigation(viewer);
            }
        });
    } else {
        console.error('❌ Flipbook Viewer no se cargó correctamente');
        showError();
    }

    function setupControls(viewer) {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageIndicator = document.getElementById('page-indicator');

        function updateControls() {
            pageIndicator.textContent = `Página ${viewer.get_page_num() + 1} de ${viewer.page_count}`;
            prevBtn.disabled = viewer.get_page_num() === 0;
            nextBtn.disabled = viewer.get_page_num() === viewer.page_count - 1;
        }

        prevBtn.addEventListener('click', () => {
            viewer.prev_page();
            updateControls();
        });

        nextBtn.addEventListener('click', () => {
            viewer.next_page();
            updateControls();
        });

        // Actualizar controles cuando cambie la página
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

    function showError() {
        const container = document.getElementById('flipbook-container');
        container.innerHTML = `
            <div class="error-message">
                <h3>⚠️ Error al cargar el flipbook</h3>
                <p>Por favor, verifica que:</p>
                <ul>
                    <li>Las imágenes estén en la carpeta assets/pdf-images/</li>
                    <li>Los archivos se llamen page-1.jpg, page-2.jpg, etc.</li>
                    <li>El número de páginas en script.js sea correcto</li>
                </ul>
            </div>
        `;
    }

    function updateControls() {
        if (!flipbookViewer) return;
        const pageIndicator = document.getElementById('page-indicator');
        if (pageIndicator) {
            pageIndicator.textContent = `Página ${flipbookViewer.get_page_num() + 1} de ${flipbookViewer.page_count}`;
        }
    }
});
