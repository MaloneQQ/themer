const fs = require('pn/fs'),
  mkdirp = require('mkdirp-promise'),
  path = require('path'),
  Rx = require('rxjs/Rx'),
  resolvePackage = require('./resolve');

const flatten = arr => [].concat.apply([], arr);

module.exports = function themer(colorsPackageName, templatePackageNames, outDirName, extraArgs) {
  return Rx.Observable.create(observer => {
    observer.next('resolving packages...');
    Promise.all([colorsPackageName, ...templatePackageNames].map(resolvePackage))
      .then(requireables => {
        const colors = require(requireables[0]).colors;
        const templates = requireables.slice(1).map(require);
        const templateNames = templatePackageNames.map(templatePath => path.basename(templatePath));
        observer.next('rendering templates...');
        return Promise.all(
          flatten(
            templates.map(
              (template, i) => template.render(colors, extraArgs).map(
                promisedFile =>
                  promisedFile
                    .then(file => ({ file: file, dir: templateNames[i] }))
                    .catch(err => Promise.reject(`${templateNames[i]}: ${err}`))
              )
            )
          )
        );
      })
      .then(outputs => {
        observer.next('writing files...');
        return Promise.all(
          outputs.map(
            output => {
              const outputFilePath = path.resolve(outDirName, output.dir, output.file.name);
              return mkdirp(path.dirname(outputFilePath)).then(
                () => fs.writeFile(outputFilePath, output.file.contents)
              );
            }
          )
        );
      })
      .then(() => {
        observer.complete();
      })
      .catch(e => {
        observer.error(e);
      });
  });
}
