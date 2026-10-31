export default function () {
  let tree = <Node id="core" label="core" sub="innermost" tag="active" />;
  for (let depth = 8; depth >= 1; depth--) tree = <Panel id={'p' + depth} title={'Layer ' + depth + ' with a fairly long panel title'}><Row>{tree}<Node id={'n' + depth} label={'L' + depth} /></Row></Panel>;
  return tree;
}
