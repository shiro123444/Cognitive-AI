export function particleStyleFor(type, emphasis = false) {
  if (type === 'cloud') {
    return {
      count: emphasis ? 420 : 300,
      radius: emphasis ? 4.6 : 4,
      size: emphasis ? 0.22 : 0.15,
      opacity: emphasis ? 0.78 : 0.6,
      deformation: 1
    };
  }

  return {
    count: 0,
    radius: 3,
    size: emphasis ? 0.16 : 0.08,
    opacity: emphasis ? 0.82 : 0.5,
    deformation: emphasis ? 0.72 : 0.5
  };
}
