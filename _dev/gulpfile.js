var gulp = require('gulp'),
    sass = require('gulp-sass'),
    rename = require('gulp-rename'),
    cssmin = require('gulp-minify-css'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    jshint = require('gulp-jshint'),
    scsslint = require('gulp-sass-lint'),
    cache = require('gulp-cached'),
    prefix = require('gulp-autoprefixer'),
    browserSync = require('browser-sync'),
    reload = browserSync.reload,
    minifyHTML = require('gulp-minify-html'),
    size = require('gulp-size'),
    imagemin = require('gulp-imagemin'),
    pngquant = require('imagemin-pngquant'),
    plumber = require('gulp-plumber'),
    deploy = require('gulp-gh-pages'),
    notify = require('gulp-notify');
sourcemaps = require('gulp-sourcemaps');

gulp.task('scss', function() {
    var onError = function(err) {
        notify.onError({
            title: 'Gulp',
            subtitle: 'Failure!',
            message: 'Error: <%= error.message %>',
            sound: 'Beep',
        })(err);
        this.emit('end');
    };

    return gulp
        .src('assets/scss/main.scss')
        .pipe(sourcemaps.init())
        .pipe(plumber({ errorHandler: onError }))
        .pipe(sass())
        .pipe(size({ gzip: true, showFiles: true }))
        .pipe(prefix())
        .pipe(rename('main.css'))
        .pipe(gulp.dest('../css'))
        .pipe(reload({ stream: true }))
        .pipe(cssmin())
        .pipe(size({ gzip: true, showFiles: true }))
        .pipe(rename({ suffix: '.min' }))
        .pipe(sourcemaps.write(''))
        .pipe(gulp.dest('../css'));
});

gulp.task('browser-sync', function() {
    browserSync.init({
        proxy: 'http://necto.test',
        port: 3000,
    });
});

// gulp.task('deploy', function() {
//     return gulp.src('../dist/**/*').pipe(deploy());
// });

gulp.task('js', function() {
    gulp.src('assets/js/*.js')
        // .pipe(uglify())
        .pipe(size({ gzip: true, showFiles: true }))
        .pipe(concat('main.js'))
        .pipe(gulp.dest('../js'))
        .pipe(reload({ stream: true }));
});

gulp.task('scss-lint', function() {
    gulp.src('assets/scss/**/*.scss')
        .pipe(cache('scsslint'))
        .pipe(scsslint());
});

gulp.task('jshint', function() {
    gulp.src('assets/js/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('vendor', function() {
    gulp.src('assets/vendor/**/*.*')
        .pipe(gulp.dest('../vendor/'))
        .pipe(reload({ stream: true }));
});

gulp.task('watch', function() {
    gulp.watch('assets/scss/**/*.scss', ['scss']);
    gulp.watch('assets/js/*.js', ['jshint', 'js']);
    gulp.watch('./*.html', ['minify-html']);
    gulp.watch('assets/img/*', ['imgmin']);
    // gulp.watch('assets/vendor/*', ['vendor']);
});

gulp.task('imgmin', function() {
    return gulp
        .src('assets/img/**/*.*')
        .pipe(
            imagemin({
                progressive: true,
                svgoPlugins: [{ removeViewBox: false }],
                use: [pngquant()],
            })
        )
        .pipe(gulp.dest('../img'));
});

// gulp.task('fonts', function() {
//     gulp.src('assets/fonts/**/*.*')
//         .pipe(gulp.dest('../fonts/'))
//         .pipe(reload({ stream: true }));
// });

gulp.task('default', ['browser-sync', 'js', 'imgmin', 'scss', /* 'fonts', 'vendor', */ 'watch']);
