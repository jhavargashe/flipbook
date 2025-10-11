// Configuración del flipbook
document.addEventListener('DOMContentLoaded', function() {
    const book = {
        // Número total de páginas
        numPages: () => 10,
        
        // Función para cargar cada página
        getPage: (pageNum, callback) => {
            const img = new Image();
            // Asegúrate de que las imágenes estén en la carpeta assets/pdf-images/
            img.src = `assets/pdf-images/page-${pageNum + 1}.jpg`;
            img.onload = () => callback(null, img);
            img.onerror = () => {
                console.error(`Error cargando página ${pageNum + 1}`);
                callback(new Error('Failed to load page'));
            };
        }
    };

    // Inicializar el flipbook
    if (typeof init !== 'undefined') {
        init(book, 'flipbook-container', (err, viewer) => {
            if (err) {
                console.error('Error inicializando flipbook:', err);
            } else {
                console.log('Flipbook inicializado. Total páginas:', viewer.page_count);
                
                // Evento cuando se ve una página
                viewer.on('seen', pageNumber => {
                    console.log('Página visualizada:', pageNumber);
                    // Aquí puedes agregar analytics o tracking
                });
            }
        });
    } else {
        console.error('Flipbook Viewer no se cargó correctamente');
    }
});